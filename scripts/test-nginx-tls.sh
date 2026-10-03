#!/usr/bin/env bash
# Docker test of the listener contract (HTTP_PORT, HTTPS_PORT, TLS_*, HEALTH_PORT) for the nginx image, the same file in
# every nginx-based frontend repo. Builds deploy/Dockerfile (or uses IMAGE=<ref>) and runs it hardened (user 101, read-only
# root, all caps dropped, scratch dirs on tmpfs, the html root on a seeded volume as the deploy's emptyDir):
#   A plain only (no TLS env, the default)     B TLS only            C TLS + HTTP_PORT empty (TLS only listener)
#   D TLS_CLIENT_AUTH=require                  E TLS_CLIENT_AUTH=optional
#   F TLS_MIN_VERSION=1.3                      G HEALTH_PORT serves only /healthz
#   H start errors (one of cert/key, auth without CA / without TLS, no listener, cert/key mismatch, bad values)
#   I live replacement of the server certificate, of the client CA, and of a broken pair, without a restart
#   J hardening: uid 101, read-only root, no capabilities
set -uo pipefail

cd "$(dirname "$0")/.."
for tool in docker openssl curl; do command -v "$tool" >/dev/null || { echo "$tool is required" >&2; exit 2; }; done

TAG=${IMAGE:-nginx-tls-test:$$}
WORK=$(mktemp -d)
VOL=nginx-tls-html-$$
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
SRC=$PWD
cd "$WORK"
mk_ca() { openssl req -x509 -newkey rsa:2048 -nodes -keyout "$1.key" -out "$1.crt" -days 2 -subj "/CN=$1" 2>/dev/null; }
mk_leaf() { # mk_leaf <name> <ca> <cn> [san]
  openssl req -newkey rsa:2048 -nodes -keyout "$1.key" -out "$1.csr" -subj "/CN=$3" 2>/dev/null
  printf 'subjectAltName=DNS:%s\n' "${4:-$3}" > "$1.ext"
  openssl x509 -req -in "$1.csr" -CA "$2.crt" -CAkey "$2.key" -CAcreateserial -out "$1.crt" -days 2 -extfile "$1.ext" 2>/dev/null
}
mk_ca ca; mk_ca otherca
mk_leaf server ca localhost
mk_leaf server2 ca localhost
mk_leaf client ca client
mk_leaf rogue otherca client
# /tls and /ca are laid out like a Kubernetes Secret mount: files are symlinks into ..data, which is swapped on renewal.
mkdir -p tls/v1 tls/v2 ca/v1 ca/v2
cp server.crt tls/v1/tls.crt; cp server.key tls/v1/tls.key; cp server2.crt tls/v2/tls.crt; cp server2.key tls/v2/tls.key
cp ca.crt ca/v1/ca.crt; cp otherca.crt ca/v2/ca.crt
for d in tls ca; do
  ln -s v1 $d/..data
  for f in $d/v1/*; do ln -s "..data/$(basename "$f")" "$d/$(basename "$f")"; done
done
swap() { rm -f "$WORK/$1/..data"; ln -s "$2" "$WORK/$1/..data"; } # swap <tls|ca> <v1|v2>
chmod -R a+rX tls ca
# a mismatched pair: the certificate of server with the key of server2
mkdir bad; cp server.crt bad/tls.crt; cp server2.key bad/tls.key; chmod -R a+rX bad

# The runtime values the entrypoint requires: the NEXT_PUBLIC_* names in its "for ... in" list.
ENVS=()
for name in $(grep -E '^for [a-z]+ in NEXT_PUBLIC_' "$SRC/deploy/docker-entrypoint.sh" | grep -Eo 'NEXT_PUBLIC_[A-Z0-9_]+'); do
  ENVS+=(-e "$name=test.example.com")
done
ENVS+=(-e "NEXT_PUBLIC_CAPTCHA_PROVIDER=none") # id-frontend validates it; ignored elsewhere
ENVS+=(-e "WARMUP_FLAG=ICE{test}")
cd "$SRC"

HARDEN=(--read-only --cap-drop=ALL --security-opt no-new-privileges --user 101:101
  --tmpfs /tmp:uid=101,gid=101 --tmpfs /run:uid=101,gid=101 --tmpfs /var/cache/nginx:uid=101,gid=101
  -v "$VOL:/usr/share/nginx/html")

# The deploy seeds an emptyDir with the html root (init container); the same here.
docker volume create "$VOL" >/dev/null
docker run --rm --user 0:0 -v "$VOL:/seed" --entrypoint sh "$TAG" \
  -c 'cp -R /usr/share/nginx/html/. /seed/ && chown -R 101:101 /seed' || { echo "seed failed" >&2; exit 1; }

PORTS=(-p 127.0.0.1::3000 -p 127.0.0.1::8443 -p 127.0.0.1::8081)
start() { # start <name> <docker args...>; prints the container id, waits until nginx is up or dead
  local name=$1; shift
  local id
  id=$(docker run -d --name "$name-$$" "${HARDEN[@]}" "${ENVS[@]}" "${PORTS[@]}" "$@" "$TAG") || return 1
  PIDS+=("$id")
  for _ in $(seq 1 40); do
    [[ "$(docker inspect -f '{{.State.Running}}' "$id")" == true ]] || { docker logs "$id" >&2; return 1; }
    logs=$(docker logs "$id" 2>&1); grep -q 'start worker process' <<<"$logs" && { echo "$id"; return 0; }
    sleep 0.5
  done
  docker logs "$id" >&2; return 1
}
port() { docker port "$1" "$2/tcp" | head -1 | sed 's/.*://'; }
stop() { docker rm -f "$1" >/dev/null 2>&1; }
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$@"; }
refused() { # refused <name> <curl args...>: no HTTP 2xx came back (handshake refused or connection dropped)
  local name=$1; shift
  local out rc
  out=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$@" 2>/dev/null); rc=$?
  [[ $rc -ne 0 || "$out" != 2* ]] && ok "$name (curl exit $rc, http $out)" || bad "$name was served ($out)"
}
fails() { # fails <name> <expected message> <env args...>: the container must exit non-zero with the message
  local name=$1 msg=$2; shift 2
  local out rc
  out=$(docker run --rm "${HARDEN[@]}" "${ENVS[@]}" "$@" "$TAG" 2>&1); rc=$?
  if [[ $rc -ne 0 ]] && grep -qF -- "$msg" <<<"$out"; then ok "$name (exit $rc)"; else bad "$name (exit $rc, wanted '$msg'): $(tail -3 <<<"$out")"; fi
}

TLS=(-v "$WORK/tls:/tls:ro" -e TLS_CERT_FILE=/tls/tls.crt -e TLS_KEY_FILE=/tls/tls.key -e TLS_RELOAD_INTERVAL=2)
CA=(-v "$WORK/ca:/ca:ro" -e TLS_CLIENT_CA_FILE=/ca/ca.crt)
SERVER=(--cacert "$WORK/ca.crt")
CLIENT=(--cert "$WORK/client.crt" --key "$WORK/client.key")
ROGUE=(--cert "$WORK/rogue.crt" --key "$WORK/rogue.key")

echo "== A plain only (default)"
C=$(start plain) || { bad "container did not start"; exit 1; }
check "A1 /healthz on 3000 -> 200" 200 "$(code "http://127.0.0.1:$(port "$C" 3000)/healthz")"
hdr=$(curl -s -D - -o /dev/null --max-time 10 "http://127.0.0.1:$(port "$C" 3000)/")
grep -qi '^content-security-policy:' <<<"$hdr" && ok "A2 CSP header present" || bad "A2 CSP header missing"
refused "A3 nothing on 8443" -k "https://localhost:$(port "$C" 8443)/"
refused "A4 nothing on 8081" "http://127.0.0.1:$(port "$C" 8081)/healthz"
stop "$C"
C=$(start plain-port -e HTTP_PORT=3000) || bad "A5 explicit HTTP_PORT=3000 did not start"
check "A5 HTTP_PORT=3000 -> 200" 200 "$(code "http://127.0.0.1:$(port "$C" 3000)/healthz")"
stop "$C"

echo "== B TLS only on top of plain"
C=$(start tls "${TLS[@]}") || { bad "container did not start"; exit 1; }
P=$(port "$C" 8443)
check "B1 TLS /healthz -> 200" 200 "$(code "${SERVER[@]}" "https://localhost:$P/healthz")"
hdr=$(curl -sS -D - -o /dev/null --max-time 10 --http2 "${SERVER[@]}" "https://localhost:$P/")
grep -qi '^HTTP/2 200' <<<"$hdr" && ok "B2 HTTP/2 on /" || bad "B2 not HTTP/2 200 on /"
grep -qi '^content-security-policy:' <<<"$hdr" && ok "B3 CSP header present" || bad "B3 CSP header missing"
check "B4 plain 3000 still served" 200 "$(code "http://127.0.0.1:$(port "$C" 3000)/healthz")"
check "B5 min version 1.2 accepts TLS 1.2" 200 "$(code --tls-max 1.2 "${SERVER[@]}" "https://localhost:$P/healthz")"
check "B6 no client cert needed (auth off)" 200 "$(code "${SERVER[@]}" "https://localhost:$P/healthz")"
stop "$C"

echo "== C TLS only (HTTP_PORT empty)"
C=$(start tlsonly "${TLS[@]}" -e HTTP_PORT=) || { bad "container did not start"; exit 1; }
check "C1 TLS -> 200" 200 "$(code "${SERVER[@]}" "https://localhost:$(port "$C" 8443)/healthz")"
refused "C2 plain 3000 is off" "http://127.0.0.1:$(port "$C" 3000)/healthz"
stop "$C"

echo "== D TLS_CLIENT_AUTH=require"
C=$(start require "${TLS[@]}" "${CA[@]}" -e TLS_CLIENT_AUTH=require -e HTTP_PORT=) || { bad "container did not start"; exit 1; }
P=$(port "$C" 8443); URL=https://localhost:$P/healthz
refused "D1 no client cert is refused" "${SERVER[@]}" "$URL"
refused "D2 client cert of another CA is refused" "${SERVER[@]}" "${ROGUE[@]}" "$URL"
check "D3 valid client cert -> 200" 200 "$(code "${SERVER[@]}" "${CLIENT[@]}" "$URL")"
hdr=$(curl -sS -D - -o /dev/null --max-time 10 --http2 "${SERVER[@]}" "${CLIENT[@]}" "https://localhost:$P/")
grep -qi '^HTTP/2 200' <<<"$hdr" && ok "D4 HTTP/2 with client cert" || bad "D4 not HTTP/2 200"
stop "$C"

echo "== E TLS_CLIENT_AUTH=optional"
C=$(start optional "${TLS[@]}" "${CA[@]}" -e TLS_CLIENT_AUTH=optional -e HTTP_PORT=) || { bad "container did not start"; exit 1; }
P=$(port "$C" 8443); URL=https://localhost:$P/healthz
check "E1 no client cert -> 200" 200 "$(code "${SERVER[@]}" "$URL")"
check "E2 valid client cert -> 200" 200 "$(code "${SERVER[@]}" "${CLIENT[@]}" "$URL")"
out=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "${SERVER[@]}" "${ROGUE[@]}" "$URL" 2>&1); rc=$?
echo "  info E3 presented-but-invalid client cert: curl exit $rc, http '$out'"
[[ $rc -ne 0 || "$out" != 2* ]] && ok "E3 presented but invalid client cert is refused" || bad "E3 invalid client cert was served"
stop "$C"

echo "== F TLS_MIN_VERSION=1.3"
C=$(start tls13 "${TLS[@]}" -e TLS_MIN_VERSION=1.3 -e HTTP_PORT=) || { bad "container did not start"; exit 1; }
P=$(port "$C" 8443)
proto=$(echo | openssl s_client -connect "localhost:$P" -servername localhost -tls1_3 -CAfile "$WORK/ca.crt" 2>/dev/null | grep -o 'TLSv1.3' | head -1)
check "F1 TLS 1.3 handshake works" TLSv1.3 "$proto"
refused "F2 TLS 1.2 refused" --tls-max 1.2 "${SERVER[@]}" "https://localhost:$P/healthz"
stop "$C"

echo "== G HEALTH_PORT"
C=$(start health "${TLS[@]}" "${CA[@]}" -e TLS_CLIENT_AUTH=require -e HTTP_PORT= -e HEALTH_PORT=8081) || { bad "container did not start"; exit 1; }
H=$(port "$C" 8081)
check "G1 health /healthz -> 200 without any cert" 200 "$(code "http://127.0.0.1:$H/healthz")"
check "G2 health / -> 404" 404 "$(code "http://127.0.0.1:$H/")"
check "G3 health /index.html -> 404" 404 "$(code "http://127.0.0.1:$H/index.html")"
refused "G4 main site is not on the health port" -o /dev/null "http://127.0.0.1:$H/_next/"
refused "G5 TLS still requires the client cert" "${SERVER[@]}" "https://localhost:$(port "$C" 8443)/healthz"
stop "$C"
C=$(start health-plain -e HEALTH_PORT=8081) || { bad "container did not start"; exit 1; }
check "G6 plain mode: health port /healthz -> 200" 200 "$(code "http://127.0.0.1:$(port "$C" 8081)/healthz")"
check "G7 plain mode: health port / -> 404" 404 "$(code "http://127.0.0.1:$(port "$C" 8081)/")"
check "G8 plain mode: 3000 serves the site" 200 "$(code "http://127.0.0.1:$(port "$C" 3000)/healthz")"
stop "$C"

echo "== H start errors"
fails "H1 certificate without key" "must be set together" -v "$WORK/tls:/tls:ro" -e TLS_CERT_FILE=/tls/tls.crt
fails "H2 key without certificate" "must be set together" -v "$WORK/tls:/tls:ro" -e TLS_KEY_FILE=/tls/tls.key
fails "H3 client auth without a CA file" "needs TLS_CLIENT_CA_FILE" "${TLS[@]}" -e TLS_CLIENT_AUTH=require
fails "H4 client auth optional without a CA file" "needs TLS_CLIENT_CA_FILE" "${TLS[@]}" -e TLS_CLIENT_AUTH=optional
fails "H5 client auth without TLS" "needs TLS" "${CA[@]}" -e TLS_CLIENT_AUTH=require
fails "H6 no listener at all" "no listener" -e HTTP_PORT=
fails "H7 certificate and key do not match" "nginx -t failed" -v "$WORK/bad:/tls:ro" -e TLS_CERT_FILE=/tls/tls.crt -e TLS_KEY_FILE=/tls/tls.key
fails "H8 unreadable certificate" "not readable" -e TLS_CERT_FILE=/nope/tls.crt -e TLS_KEY_FILE=/nope/tls.key
fails "H9 bad TLS_MIN_VERSION" "TLS_MIN_VERSION" "${TLS[@]}" -e TLS_MIN_VERSION=1.1
fails "H10 bad TLS_CLIENT_AUTH" "TLS_CLIENT_AUTH must be" -e TLS_CLIENT_AUTH=maybe
fails "H11 bad HTTP_PORT" "HTTP_PORT must be" -e HTTP_PORT=abc
fails "H12 health port equals the plain port" "HEALTH_PORT must differ" -e HEALTH_PORT=3000

echo "== I live replacement without a restart"
C=$(start reload "${TLS[@]}" "${CA[@]}" -e TLS_CLIENT_AUTH=optional -e HTTP_PORT=) || { bad "container did not start"; exit 1; }
P=$(port "$C" 8443)
serial() { echo | openssl s_client -connect "localhost:$P" -servername localhost -CAfile "$WORK/ca.crt" 2>/dev/null | openssl x509 -noout -serial; }
wait_serial_change() { # wait_serial_change <old>: prints the new serial once it differs
  local s=$1
  for _ in $(seq 1 30); do sleep 1; s=$(serial); [[ -n "$s" && "$s" != "$1" ]] && break; done
  echo "$s"
}
pid1=$(docker exec "$C" cat /run/nginx.pid)
before=$(serial)
swap tls v2
after=$(wait_serial_change "$before")
[[ -n "$before" && "$after" != "$before" ]] && ok "I1 new server certificate served after the Secret swap" || bad "I1 server certificate not reloaded"
check "I2 container still running, same master" true "$(docker inspect -f '{{.State.Running}}' "$C")"
logs=$(docker logs "$C" 2>&1); grep -q 'TLS files changed: reloaded' <<<"$logs" && ok "I3 reload logged" || bad "I3 no reload log line"

# client CA swapped for another one: the client of the first CA is refused, the client of the other CA is accepted
check "I4 client of the original CA accepted before" 200 "$(code "${SERVER[@]}" "${CLIENT[@]}" "https://localhost:$P/healthz")"
swap ca v2
for _ in $(seq 1 30); do sleep 1; [[ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "${SERVER[@]}" "${ROGUE[@]}" "https://localhost:$P/healthz")" == 200 ]] && break; done
check "I5 client of the new CA accepted after the CA swap" 200 "$(code "${SERVER[@]}" "${ROGUE[@]}" "https://localhost:$P/healthz")"
refused "I6 client of the old CA refused after the CA swap" "${SERVER[@]}" "${CLIENT[@]}" "https://localhost:$P/healthz"
swap ca v1

# a broken pair (certificate of one key, key of another): nginx -t fails, the running config is kept
mkdir -p "$WORK/tls/v3"; cp "$WORK/server.crt" "$WORK/tls/v3/tls.crt"; cp "$WORK/server2.key" "$WORK/tls/v3/tls.key"; chmod -R a+rX "$WORK/tls"
good=$(serial)
swap tls v3
sleep 6
logs=$(docker logs "$C" 2>&1); grep -q 'nginx -t fails; keeping the running config' <<<"$logs" && ok "I7 broken pair rejected and logged" || bad "I7 broken pair not logged"
check "I8 old certificate still served" "$good" "$(serial)"
check "I9 pid of the master unchanged" "$pid1" "$(docker exec "$C" cat /run/nginx.pid)"
swap tls v1
fixed=$(wait_serial_change "$good")
[[ -n "$fixed" && "$fixed" != "$good" ]] && ok "I10 a good pair after the broken one is loaded" || bad "I10 not recovered"
stop "$C"

echo "== J hardening"
C=$(start hard "${TLS[@]}") || { bad "container did not start"; exit 1; }
check "J1 runs as uid 101" 101 "$(docker exec "$C" id -u)"
docker exec "$C" sh -c 'touch /probe' 2>/dev/null && bad "J2 root filesystem is writable" || ok "J2 root filesystem is read-only"
check "J3 effective capabilities empty" 0000000000000000 "$(docker exec "$C" sh -c 'grep CapEff /proc/1/status' | awk '{print $2}')"
stop "$C"

echo
[[ $fail -eq 0 ]] && echo "ALL PASSED" || { echo "FAILED" >&2; exit 1; }
