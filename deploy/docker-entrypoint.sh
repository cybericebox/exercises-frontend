#!/bin/sh
# Runtime env substitution for the static export. The build baked each
# NEXT_PUBLIC_* value as a placeholder equal to its variable name wrapped in double
# underscores (__NEXT_PUBLIC_X__); here we replace those placeholders with the actual
# runtime env values so the same image works across environments without a rebuild.
set -e

ROOT=/usr/share/nginx/html

# The hosts are derived from NEXT_PUBLIC_DOMAIN when they are not set (deploy/base-domain.sh, the same file in every frontend);
# the derived values are exported, so the substitution below treats them like the others. The other operator values are required.
. /usr/local/lib/base-domain.sh
base_domain_derive || exit 1
for name in NEXT_PUBLIC_SUPPORT_EMAIL; do
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    echo "$name is required." >&2
    exit 1
  fi
done
# Analytics is optional; the build folded the placeholder, so empty is set here.
: "${NEXT_PUBLIC_GOOGLE_ANALYTICS_ID:=}"
export NEXT_PUBLIC_GOOGLE_ANALYTICS_ID

# One pass: a single sed script with an expression per NEXT_PUBLIC_* variable, run once over each
# file that holds a placeholder (in parallel: busybox sed is slow on the minified bundles). Only the
# wrapped token is replaced; the bare name is also an object key and plain text in the bundle.
# Files without a placeholder are never rewritten.
script=$(mktemp)
trap 'rm -f "$script"' EXIT
printenv | grep '^NEXT_PUBLIC_' | while IFS='=' read -r key value; do
  # Escape sed-special chars in the replacement (| delimiter, & match-ref, \).
  esc=$(printf '%s' "$value" | sed -e 's/[\\&|]/\\&/g')
  printf 's|__%s__|%s|g\n' "$key" "$esc"
done > "$script"

grep -rlIE '__NEXT_PUBLIC_[A-Z0-9_]+__' "$ROOT" | xargs -r -n 1 -P "$(nproc)" sed -i -f "$script"

# A placeholder that is still there means its variable is missing: fail the start, not the page.
left=
# The cheap fixed-string scan first; the token names are only collected when something is left.
if grep -rqIF '__NEXT_PUBLIC_' "$ROOT"; then
  left=$(grep -rhoIE '__NEXT_PUBLIC_[A-Z0-9_]+__' "$ROOT" | sort -u | tr '\n' ' ')
fi
if [ -n "$left" ]; then
  echo "No value for: $left(set the variable, an empty one is fine for an optional value)." >&2
  exit 1
fi
