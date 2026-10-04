# One base domain for every host (POSIX sh, sourced). The same file lives in every CyberICEBox
# frontend (deploy/base-domain.sh) and the copies must stay identical; the same rule is in
# daemon/internal/config/hosts.go, infrastructure/cloud/scripts/cibconf.py, every frontend's
# src/**/hosts.ts and next.config, and tests/base-domain-vectors.json holds the shared test vectors.
#
# Rule: NEXT_PUBLIC_DOMAIN is the only input, a bare lowercase host name. There are no per-host settings:
#   main = DOMAIN, api = api.DOMAIN, id = id.DOMAIN, admin = admin.DOMAIN, exercises = exercises.DOMAIN,
#   event sites = <tag>.DOMAIN, the cookie domain = DOMAIN.
#
# base_domain_check returns 1 and prints the reason to stderr when NEXT_PUBLIC_DOMAIN is unset, empty or
# not a bare lowercase host name. base_domain_host PREFIX prints the host for a prefix ("" for DOMAIN
# itself, "api", "id", "admin", "exercises").
base_domain_check() {
  _bd_domain=${NEXT_PUBLIC_DOMAIN:-}
  if [ -z "$_bd_domain" ]; then
    echo "NEXT_PUBLIC_DOMAIN is required." >&2
    return 1
  fi
  # Lowercase labels of letters, digits and inner hyphens separated by single dots; no scheme, port or path.
  if [ "${#_bd_domain}" -gt 253 ] \
    || ! printf '%s' "$_bd_domain" | grep -Eq '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$'; then
    echo "NEXT_PUBLIC_DOMAIN must be a bare lowercase host name (no scheme, port or path), got: $_bd_domain" >&2
    return 1
  fi
}

base_domain_host() {
  if [ -n "$1" ]; then printf '%s.%s\n' "$1" "$NEXT_PUBLIC_DOMAIN"; else printf '%s\n' "$NEXT_PUBLIC_DOMAIN"; fi
}
