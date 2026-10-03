#!/bin/sh
# Listener setup for the nginx images, the same file in every frontend (docker-entrypoint.d/60-nginx-config.sh).
# The nginx config itself lives in deploy/nginx/ (nginx.conf, server.conf and the snippets under /etc/nginx/snippets).
# This script only reads the env, validates it, and decides which snippets are active: it renders each active snippet
# with envsubst (a fixed variable list) into /tmp/nginx-gen and writes an empty file for each inactive one. It then
# runs `nginx -t`, so a bad combination stops the container at start, and starts the certificate reload loop.
#
#   HTTP_PORT            3000   plain HTTP listener; set but empty = off
#   HTTPS_PORT           8443   TLS listener, on only when TLS_CERT_FILE and TLS_KEY_FILE are set
#   TLS_CERT_FILE, TLS_KEY_FILE   PEM server certificate chain and key; both = TLS on, exactly one = error
#   TLS_MIN_VERSION      1.2    1.2 or 1.3
#   TLS_CLIENT_CA_FILE          PEM bundle of the CA(s) that signed the client certificates
#   TLS_CLIENT_AUTH      off    off | optional (verify when presented) | require; optional/require need the CA file and TLS
#   HEALTH_PORT                 when set: an extra plain listener on HEALTH_BIND (default 0.0.0.0) serving only /healthz
#   TLS_RELOAD_INTERVAL  60     seconds between checks of the certificate files; a change runs nginx -t and a reload
set -e

SNIPPETS=/etc/nginx/snippets
GEN=/tmp/nginx-gen
mkdir -p "$GEN"

die() { echo "[nginx] $*" >&2; exit 1; }
is_port() { case "$1" in '' | *[!0-9]*) return 1 ;; esac; [ "$1" -ge 1 ] && [ "$1" -le 65535 ]; }
is_path() { printf '%s' "$1" | grep -Eq '^/[A-Za-z0-9._/+=@-]+$'; }

# Unset means the default; set but empty means off (HTTP_PORT) or unset (the others).
HTTP_PORT=${HTTP_PORT-3000}
HTTPS_PORT=${HTTPS_PORT:-8443}
TLS_CERT_FILE=${TLS_CERT_FILE:-}
TLS_KEY_FILE=${TLS_KEY_FILE:-}
TLS_MIN_VERSION=${TLS_MIN_VERSION:-1.2}
TLS_CLIENT_CA_FILE=${TLS_CLIENT_CA_FILE:-}
TLS_CLIENT_AUTH=${TLS_CLIENT_AUTH:-off}
HEALTH_PORT=${HEALTH_PORT:-}
HEALTH_BIND=${HEALTH_BIND:-0.0.0.0}
TLS_RELOAD_INTERVAL=${TLS_RELOAD_INTERVAL:-60}

[ -z "$HTTP_PORT" ] || is_port "$HTTP_PORT" || die "HTTP_PORT must be a port number or empty (got '$HTTP_PORT')."
is_port "$HTTPS_PORT" || die "HTTPS_PORT must be a port number (got '$HTTPS_PORT')."
[ -z "$HEALTH_PORT" ] || is_port "$HEALTH_PORT" || die "HEALTH_PORT must be a port number or empty (got '$HEALTH_PORT')."
printf '%s' "$HEALTH_BIND" | grep -Eq '^[0-9A-Fa-f:.]+$' || die "HEALTH_BIND must be an IP address (got '$HEALTH_BIND')."
case "$TLS_RELOAD_INTERVAL" in '' | *[!0-9]* | 0) die "TLS_RELOAD_INTERVAL must be a positive number of seconds." ;; esac
case "$TLS_MIN_VERSION" in
  1.2) TLS_PROTOCOLS='TLSv1.2 TLSv1.3' ;;
  1.3) TLS_PROTOCOLS='TLSv1.3' ;;
  *) die "TLS_MIN_VERSION must be 1.2 or 1.3 (got '$TLS_MIN_VERSION')." ;;
esac
case "$TLS_CLIENT_AUTH" in
  off) TLS_VERIFY_CLIENT=off ;;
  optional) TLS_VERIFY_CLIENT=optional ;;
  require) TLS_VERIFY_CLIENT=on ;;
  *) die "TLS_CLIENT_AUTH must be off, optional or require (got '$TLS_CLIENT_AUTH')." ;;
esac

tls=false
if [ -n "$TLS_CERT_FILE" ] || [ -n "$TLS_KEY_FILE" ]; then
  [ -n "$TLS_CERT_FILE" ] && [ -n "$TLS_KEY_FILE" ] || die "TLS_CERT_FILE and TLS_KEY_FILE must be set together."
  tls=true
  for f in "$TLS_CERT_FILE" "$TLS_KEY_FILE"; do
    is_path "$f" || die "'$f' is not a usable file path."
    [ -r "$f" ] || die "$f is not readable."
  done
fi
if [ "$TLS_CLIENT_AUTH" != off ]; then
  [ "$tls" = true ] || die "TLS_CLIENT_AUTH=$TLS_CLIENT_AUTH needs TLS (TLS_CERT_FILE and TLS_KEY_FILE)."
  [ -n "$TLS_CLIENT_CA_FILE" ] || die "TLS_CLIENT_AUTH=$TLS_CLIENT_AUTH needs TLS_CLIENT_CA_FILE."
  is_path "$TLS_CLIENT_CA_FILE" || die "'$TLS_CLIENT_CA_FILE' is not a usable file path."
  [ -r "$TLS_CLIENT_CA_FILE" ] || die "$TLS_CLIENT_CA_FILE is not readable."
else
  TLS_CLIENT_CA_FILE=
fi
[ -n "$HTTP_PORT" ] || [ "$tls" = true ] || die "no listener: HTTP_PORT is empty and TLS is off."
if [ -n "$HEALTH_PORT" ]; then
  [ "$HEALTH_PORT" != "$HTTP_PORT" ] && { [ "$tls" != true ] || [ "$HEALTH_PORT" != "$HTTPS_PORT" ]; } \
    || die "HEALTH_PORT must differ from the other listener ports."
fi
[ "$tls" != true ] || [ "$HTTPS_PORT" != "$HTTP_PORT" ] || die "HTTPS_PORT must differ from HTTP_PORT."

export HTTP_PORT HTTPS_PORT TLS_CERT_FILE TLS_KEY_FILE TLS_PROTOCOLS TLS_CLIENT_CA_FILE TLS_VERIFY_CLIENT HEALTH_PORT HEALTH_BIND
VARS='${HTTP_PORT} ${HTTPS_PORT} ${TLS_CERT_FILE} ${TLS_KEY_FILE} ${TLS_PROTOCOLS} ${TLS_CLIENT_CA_FILE} ${TLS_VERIFY_CLIENT} ${HEALTH_PORT} ${HEALTH_BIND}'

# render <snippet> <on|off>: the snippet through envsubst, or an empty file.
render() {
  if [ "$2" = on ]; then
    envsubst "$VARS" < "$SNIPPETS/$1.conf" > "$GEN/$1.conf"
  else
    : > "$GEN/$1.conf"
  fi
}
render listen-http "$([ -n "$HTTP_PORT" ] && echo on || echo off)"
render listen-https "$([ "$tls" = true ] && echo on || echo off)"
render client-auth "$([ "$TLS_CLIENT_AUTH" != off ] && echo on || echo off)"
render health "$([ -n "$HEALTH_PORT" ] && echo on || echo off)"

echo "[nginx] http=${HTTP_PORT:-off} https=$([ "$tls" = true ] && echo "$HTTPS_PORT (tls>=$TLS_MIN_VERSION, client auth $TLS_CLIENT_AUTH)" || echo off) health=${HEALTH_PORT:-off}"
if [ "$TLS_CLIENT_AUTH" = require ] && [ -n "$HTTP_PORT" ]; then
  echo "[nginx] warning: the plain HTTP listener on $HTTP_PORT is open next to client auth on $HTTPS_PORT; set HTTP_PORT= (empty) to serve only TLS." >&2
fi

nginx -t || die "nginx -t failed, refusing to start."

# Renewed certificates (Kubernetes swaps the Secret mount through the ..data symlink, so poll, no inotify): when a
# checksum changes, test the config and reload; a config that fails the test keeps the old one running.
if [ "$tls" = true ]; then
  fingerprint() { cat "$TLS_CERT_FILE" "$TLS_KEY_FILE" ${TLS_CLIENT_CA_FILE:+"$TLS_CLIENT_CA_FILE"} 2>/dev/null | sha256sum; }
  (
    prev=$(fingerprint)
    while sleep "$TLS_RELOAD_INTERVAL"; do
      cur=$(fingerprint)
      [ "$cur" != "$prev" ] || continue
      [ -s /run/nginx.pid ] || continue
      prev=$cur
      if nginx -t >/dev/null 2>&1; then
        nginx -s reload && echo "[nginx] TLS files changed: reloaded." || echo "[nginx] TLS files changed but the reload signal failed." >&2
      else
        echo "[nginx] TLS files changed but nginx -t fails; keeping the running config." >&2
        nginx -t >&2 || true
      fi
    done
  ) < /dev/null &
fi
