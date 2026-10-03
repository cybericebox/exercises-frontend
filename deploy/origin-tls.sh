#!/bin/sh
# Origin TLS for the static frontends, the same file in every image (docker-entrypoint.d/60-origin-tls.sh).
#   ORIGIN_TLS=false (default)  plain listener on 3000, exactly as before.
#   ORIGIN_TLS=true             HTTP/2 over TLS on 8443 with /tls/tls.crt + /tls/tls.key (TLS 1.2+), plus a separate
#                               plain-HTTP health server on ${HEALTH_BIND:-0.0.0.0}:8081 that serves only /healthz.
#   ORIGIN_MTLS=true            with ORIGIN_TLS: require a client certificate signed by /aop/ca.crt (Cloudflare
#                               Authenticated Origin Pulls); a connection without a valid one is dropped (444).
#   ORIGIN_RELOAD_INTERVAL      seconds between checks of /tls and /aop for a renewed certificate (default 60);
#                               a change runs `nginx -s reload`, no restart.
# nginx.conf includes the generated listen block, nginx-main.conf includes the generated health server.
set -e

GEN=/tmp/nginx-gen
TLS_DIR=/tls
AOP_CA=/aop/ca.crt
mkdir -p "$GEN/http.d"

: "${ORIGIN_TLS:=false}"
: "${ORIGIN_MTLS:=false}"
: "${HEALTH_BIND:=0.0.0.0}"
: "${ORIGIN_RELOAD_INTERVAL:=60}"

for v in ORIGIN_TLS ORIGIN_MTLS; do
  eval "val=\$$v"
  case "$val" in true | false) ;; *) echo "[origin-tls] $v must be true or false (got '$val')." >&2; exit 1 ;; esac
done
case "$ORIGIN_RELOAD_INTERVAL" in '' | *[!0-9]* | 0) echo "[origin-tls] ORIGIN_RELOAD_INTERVAL must be a positive number of seconds." >&2; exit 1 ;; esac
if ! printf '%s' "$HEALTH_BIND" | grep -Eq '^[0-9A-Fa-f:.]+$'; then
  echo "[origin-tls] HEALTH_BIND must be an IP address (got '$HEALTH_BIND')." >&2
  exit 1
fi

rm -f "$GEN/http.d/origin-health.conf"

if [ "$ORIGIN_TLS" != true ]; then
  echo 'listen 3000;' > "$GEN/listen.conf"
  echo "[origin-tls] off: plain listener on 3000."
  exit 0
fi

for f in "$TLS_DIR/tls.crt" "$TLS_DIR/tls.key"; do
  [ -r "$f" ] || { echo "[origin-tls] $f is not readable." >&2; exit 1; }
done
if [ "$ORIGIN_MTLS" = true ] && [ ! -r "$AOP_CA" ]; then
  echo "[origin-tls] ORIGIN_MTLS=true needs $AOP_CA." >&2
  exit 1
fi

{
  echo 'listen 8443 ssl;'
  echo 'http2 on;'
  echo "ssl_certificate     $TLS_DIR/tls.crt;"
  echo "ssl_certificate_key $TLS_DIR/tls.key;"
  echo 'ssl_protocols TLSv1.2 TLSv1.3;'
  echo 'ssl_prefer_server_ciphers off;'
  echo 'ssl_session_timeout 1d;'
  echo 'ssl_session_cache shared:origin_tls:10m;'
  echo 'ssl_session_tickets off;'
  if [ "$ORIGIN_MTLS" = true ]; then
    echo "ssl_client_certificate $AOP_CA;"
    echo 'ssl_verify_client on;'
    echo '# nginx would answer a missing (496) or invalid (495) certificate with a 400 page; drop the connection instead.'
    echo 'error_page 495 496 = @origin_drop;'
    echo 'location @origin_drop { return 444; }'
  fi
} > "$GEN/listen.conf"

# Kubelet cannot present the client certificate: a plain-HTTP health port with nothing but /healthz.
cat > "$GEN/http.d/origin-health.conf" <<HEALTH
server {
    listen $HEALTH_BIND:8081;
    server_name _;
    root /usr/share/nginx/html;
    access_log off;

    location = /healthz {
        try_files /index.html =503;
    }

    location / {
        return 404;
    }
}
HEALTH

echo "[origin-tls] on: TLS on 8443 (mTLS=$ORIGIN_MTLS), plain health on $HEALTH_BIND:8081."

# Renewed certificates (cert-manager swaps the Secret files in place): reload nginx when they change.
fingerprint() { cat "$TLS_DIR/tls.crt" "$TLS_DIR/tls.key" "$AOP_CA" 2>/dev/null | sha256sum; }
(
  prev=$(fingerprint)
  while sleep "$ORIGIN_RELOAD_INTERVAL"; do
    cur=$(fingerprint)
    if [ "$cur" != "$prev" ] && [ -s /run/nginx.pid ]; then
      if nginx -t >/dev/null 2>&1 && nginx -s reload; then
        echo "[origin-tls] certificates changed: nginx reloaded."
        prev=$cur
      else
        echo "[origin-tls] certificates changed but nginx did not reload; retrying." >&2
      fi
    fi
  done
) < /dev/null &
