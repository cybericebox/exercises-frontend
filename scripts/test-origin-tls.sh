#!/usr/bin/env bash
# Docker test of the origin TLS contract for the nginx image, the same file in every static frontend repo.
# Builds deploy/Dockerfile (or uses IMAGE=<ref>), then runs it hardened (user 101, read-only root, all caps dropped,
# scratch dirs on tmpfs, the html root on a seeded volume as the deploy's emptyDir) and checks:
#   1 mTLS on, no client cert         -> connection refused
#   2 mTLS on, client cert of another CA -> refused
#   3 mTLS on, valid client cert      -> 200 over HTTP/2, CSP header present
#   4 plain health port 8081          -> /healthz 200, anything else 404, nothing else served
#   5 ORIGIN_MTLS=false               -> 200 without a client cert
#   6 ORIGIN_TLS=false                -> plain 3000 as before, no 8443/8081
#   7 renewed server certificate      -> picked up by the reload loop without a restart
#   8 container runs as 101 on a read-only root with no capabilities
set -uo pipefail

cd "$(dirname "$0")/.."
for tool in docker openssl curl; do command -v "$tool" >/dev/null || { echo "$tool is required" >&2; exit 2; }; done

TAG=${IMAGE:-origin-tls-test:$$}
WORK=$(mktemp -d)
VOL=origin-tls-html-$$
PIDS=()
fail=0

cleanup() {
  for c in "${PIDS[@]:-}"; do [[ -n "$c" ]] && docker rm -f "$c" >/dev/null 2>&1; done
  docker volume rm -f "$VOL" >/dev/null 2>&1
  [[ -z "${IMAGE:-}" ]] && docker rmi -f "$TAG" >/dev/null 2>&1
  rm -rf "$WORK"
}
trap cleanup EXIT

ok() { echo "  ok   $1"; }
bad() { echo "  FAIL $1" >&2; fail=1; }
check() { # check <name> <expected> <actual>
  if [[ "$2" == "$3" ]]; then ok "$1"; else bad "$1 (expected '$2', got '$3')"; fi
}

if [[ -z "${IMAGE:-}" ]]; then
  echo "== build $TAG"
  docker build -q -f deploy/Dockerfile -t "$TAG" . >/dev/null || { echo "build failed" >&2; exit 1; }
fi

echo "== certificates"
cd "$WORK"
mkdir tls aop other
mk_ca() { openssl req -x509 -newkey rsa:2048 -nodes -keyout "$1.key" -out "$1.crt" -days 2 -subj "/CN=$1" 2>/dev/null; }
mk_leaf() { # mk_leaf <name> <ca> <cn> [san]
  openssl req -newkey rsa:2048 -nodes -keyout "$1.key" -out "$1.csr" -subj "/CN=$3" 2>/dev/null
  printf 'subjectAltName=DNS:%s\n' "${4:-$3}" > "$1.ext"
  openssl x509 -req -in "$1.csr" -CA "$2.crt" -CAkey "$2.key" -CAcreateserial -out "$1.crt" -days 2 -extfile "$1.ext" 2>/dev/null
}
mk_ca ca; mk_ca otherca
mk_leaf server ca localhost
mk_leaf client ca client
mk_leaf rogue otherca client
mk_leaf server2 ca localhost
cp server.crt tls/tls.crt; cp server.key tls/tls.key; cp ca.crt aop/ca.crt
chmod -R a+rX tls aop; chmod a+r tls/* aop/*

# The runtime values the entrypoint requires: the NEXT_PUBLIC_* names in its "for ... in" list.
ENVS=()
for name in $(grep -E '^for [a-z]+ in NEXT_PUBLIC_' "$OLDPWD/deploy/docker-entrypoint.sh" | grep -Eo 'NEXT_PUBLIC_[A-Z0-9_]+'); do
  ENVS+=(-e "$name=test.example.com")
done
ENVS+=(-e "NEXT_PUBLIC_CAPTCHA_PROVIDER=none") # id-frontend validates it; ignored elsewhere
ENVS+=(-e "WARMUP_FLAG=ICE{test}")
cd "$OLDPWD"

HARDEN=(--read-only --cap-drop=ALL --security-opt no-new-privileges --user 101:101
  --tmpfs /tmp:uid=101,gid=101 --tmpfs /run:uid=101,gid=101 --tmpfs /var/cache/nginx:uid=101,gid=101
  -v "$VOL:/usr/share/nginx/html")

# The deploy seeds an emptyDir with the html root (init container); the same here.
docker volume create "$VOL" >/dev/null
docker run --rm --user 0:0 -v "$VOL:/seed" --entrypoint sh "$TAG" \
  -c 'cp -R /usr/share/nginx/html/. /seed/ && chown -R 101:101 /seed' || { echo "seed failed" >&2; exit 1; }

start() { # start <name> <docker args...>; prints the container id, waits until nginx is up or dead
  local name=$1; shift
  local id
  id=$(docker run -d --name "$name-$$" "${HARDEN[@]}" "${ENVS[@]}" -p 127.0.0.1::3000 -p 127.0.0.1::8443 -p 127.0.0.1::8081 "$@" "$TAG") || return 1
  PIDS+=("$id")
  for _ in $(seq 1 40); do
    [[ "$(docker inspect -f '{{.State.Running}}' "$id")" == true ]] || { docker logs "$id" >&2; return 1; }
    docker logs "$id" 2>&1 | grep -q 'start worker process' && { echo "$id"; return 0; }
    sleep 0.5
  done
  docker logs "$id" >&2; return 1
}
port() { docker port "$1" "$2/tcp" | head -1 | sed 's/.*://'; }
stop() { docker rm -f "$1" >/dev/null 2>&1; }

TLS_ARGS=(-v "$WORK/tls:/tls:ro" -v "$WORK/aop:/aop:ro" -e ORIGIN_TLS=true -e ORIGIN_RELOAD_INTERVAL=2)
CURL=(curl -sS -o /dev/null --max-time 10 --cacert "$WORK/ca.crt")

echo "== ORIGIN_TLS=true ORIGIN_MTLS=true"
C=$(start mtls "${TLS_ARGS[@]}" -e ORIGIN_MTLS=true) || { bad "container did not start"; exit 1; }
P=$(port "$C" 8443); H=$(port "$C" 8081)
URL=https://localhost:$P/healthz

"${CURL[@]}" "$URL" 2>/dev/null; rc=$?
[[ $rc -ne 0 ]] && ok "1 no client cert is refused (curl exit $rc)" || bad "1 no client cert was served"
"${CURL[@]}" --cert "$WORK/rogue.crt" --key "$WORK/rogue.key" "$URL" 2>/dev/null; rc=$?
[[ $rc -ne 0 ]] && ok "2 client cert of another CA is refused (curl exit $rc)" || bad "2 foreign client cert was served"
check "3 valid client cert -> 200" 200 "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 --cacert "$WORK/ca.crt" --cert "$WORK/client.crt" --key "$WORK/client.key" "$URL")"
hdr=$(curl -sS -D - -o /dev/null --max-time 10 --http2 --cacert "$WORK/ca.crt" --cert "$WORK/client.crt" --key "$WORK/client.key" "https://localhost:$P/")
grep -qi '^HTTP/2 200' <<<"$hdr" && ok "3b HTTP/2 on /" || bad "3b not HTTP/2 200 on /"
grep -qi '^content-security-policy:' <<<"$hdr" && ok "3c CSP header present" || bad "3c CSP header missing"
check "4 health /healthz -> 200" 200 "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:$H/healthz")"
check "4b health / -> 404" 404 "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:$H/")"
check "4c health /index.html -> 404" 404 "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:$H/index.html")"
curl -s -o /dev/null --max-time 5 "http://127.0.0.1:$(port "$C" 3000)/healthz"; [[ $? -ne 0 ]] && ok "no plain listener on 3000 in TLS mode" || bad "port 3000 served in TLS mode"

echo "== read-only, non-root, no capabilities"
check "8 runs as uid 101" 101 "$(docker exec "$C" id -u)"
docker exec "$C" sh -c 'touch /probe' 2>/dev/null && bad "8b root filesystem is writable" || ok "8b root filesystem is read-only"
check "8c effective capabilities empty" 0000000000000000 "$(docker exec "$C" sh -c 'grep CapEff /proc/1/status' | awk '{print $2}')"

echo "== certificate renewal without restart"
serial() { echo | openssl s_client -connect "localhost:$P" -servername localhost -CAfile "$WORK/ca.crt" -cert "$WORK/client.crt" -key "$WORK/client.key" 2>/dev/null | openssl x509 -noout -serial; }
before=$(serial)
cp "$WORK/server2.crt" "$WORK/tls/tls.crt"; cp "$WORK/server2.key" "$WORK/tls/tls.key"
after=$before
for _ in $(seq 1 30); do sleep 1; after=$(serial); [[ -n "$after" && "$after" != "$before" ]] && break; done
[[ -n "$before" && "$after" != "$before" ]] && ok "7 new certificate served after reload" || bad "7 certificate not reloaded"
check "7b container still the same process" true "$(docker inspect -f '{{.State.Running}}' "$C")"
cp "$WORK/server.crt" "$WORK/tls/tls.crt"; cp "$WORK/server.key" "$WORK/tls/tls.key"
stop "$C"

echo "== ORIGIN_TLS=true ORIGIN_MTLS=false"
C=$(start notls-mtls "${TLS_ARGS[@]}" -e ORIGIN_MTLS=false) || { bad "container did not start"; exit 1; }
check "5 no client cert -> 200" 200 "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 --cacert "$WORK/ca.crt" "https://localhost:$(port "$C" 8443)/healthz")"
stop "$C"

echo "== ORIGIN_TLS=false (default)"
C=$(start plain) || { bad "container did not start"; exit 1; }
check "6 plain /healthz on 3000 -> 200" 200 "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:$(port "$C" 3000)/healthz")"
curl -s -D - -o /dev/null --max-time 10 "http://127.0.0.1:$(port "$C" 3000)/" | grep -qi '^content-security-policy:' && ok "6b CSP header present" || bad "6b CSP header missing"
curl -sk -o /dev/null --max-time 5 "https://localhost:$(port "$C" 8443)/" ; [[ $? -ne 0 ]] && ok "6c nothing on 8443" || bad "6c 8443 served"
curl -s -o /dev/null --max-time 5 "http://127.0.0.1:$(port "$C" 8081)/healthz"; [[ $? -ne 0 ]] && ok "6d nothing on 8081" || bad "6d 8081 served"
stop "$C"

echo
[[ $fail -eq 0 ]] && echo "ALL PASSED" || { echo "FAILED" >&2; exit 1; }
