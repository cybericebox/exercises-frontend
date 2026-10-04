# One base domain for every host (POSIX sh, sourced). The same file lives in every CyberICEBox
# frontend (deploy/base-domain.sh) and the copies must stay identical; the same rule is in
# daemon/internal/config/hosts.go, infrastructure/cloud/scripts/cibconf.py and in
# tests/base-domain-vectors.json (shared test vectors).
#
# Rule: NEXT_PUBLIC_DOMAIN is a bare lowercase host name. Each host below that is empty or unset is
# derived from it; a value that is set always wins:
#   MAIN_HOST = DOMAIN, API_HOST = api.DOMAIN, ID_HOST = id.DOMAIN, ADMIN_HOST = admin.DOMAIN,
#   EXERCISES_HOST = exercises.DOMAIN, EVENT_DOMAIN = DOMAIN, COOKIE_DOMAIN = DOMAIN.
# Neither DOMAIN nor an explicit value for a host is an error.
#
# base_domain_derive exports the derived NEXT_PUBLIC_* variables; it returns 1 and prints the reason
# to stderr on an invalid DOMAIN or a host that has no value and cannot be derived.
base_domain_derive() {
  _bd_domain=${NEXT_PUBLIC_DOMAIN:-}
  if [ -n "$_bd_domain" ]; then
    # Lowercase labels of letters, digits and inner hyphens separated by single dots; no scheme, port or path.
    if [ "${#_bd_domain}" -gt 253 ] \
      || ! printf '%s' "$_bd_domain" | grep -Eq '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$'; then
      echo "NEXT_PUBLIC_DOMAIN must be a bare lowercase host name (no scheme, port or path), got: $_bd_domain" >&2
      return 1
    fi
  fi
  for _bd_pair in MAIN_HOST: API_HOST:api. ID_HOST:id. ADMIN_HOST:admin. EXERCISES_HOST:exercises. EVENT_DOMAIN: COOKIE_DOMAIN:; do
    _bd_key=NEXT_PUBLIC_${_bd_pair%%:*}
    eval "_bd_val=\${$_bd_key:-}"
    if [ -z "$_bd_val" ]; then
      if [ -z "$_bd_domain" ]; then
        echo "$_bd_key is required (set it, or set NEXT_PUBLIC_DOMAIN and it is derived)." >&2
        return 1
      fi
      _bd_val=${_bd_pair#*:}$_bd_domain
    fi
    export "$_bd_key=$_bd_val"
  done
}
