#!/bin/sh
# Runtime env substitution for the static export. The build baked each
# NEXT_PUBLIC_* value as a placeholder equal to its variable name wrapped in double
# underscores (__NEXT_PUBLIC_X__); here we replace those placeholders with the actual
# runtime env values so the same image works across environments without a rebuild.
set -e

ROOT=/usr/share/nginx/html

# NEXT_PUBLIC_DOMAIN is the only host input (deploy/base-domain.sh, the same file in every frontend): every host derives from it in the code.
# The other operator values are required.
. /usr/local/lib/base-domain.sh
base_domain_check || exit 1
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

# Installation settings (all optional, no value = not shown, deploy/cfg-check.sh): URLs are empty or https://. The root layout writes each value
# into an attribute of <html> and src/styles/cfg.css hides the blocks by it, so every one is exported to be substituted (an empty value is
# substituted too: the placeholder must not stay).
. /usr/local/lib/cfg-check.sh
# The list is a variable, not a `for name in NEXT_PUBLIC_...` line: scripts/test-nginx-tls.sh reads those lines as the REQUIRED values.
optional_urls="NEXT_PUBLIC_MAIN_SITE_URL NEXT_PUBLIC_COOKIES_URL"
for name in $optional_urls; do
  cfg_url_check "$name" || exit 1
  eval "export $name=\"\${$name:-}\""
done

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

grep -rlIiE '__NEXT_PUBLIC_[A-Z0-9_]+__' "$ROOT" | xargs -r -n 1 -P "$(nproc)" sed -i -f "$script"

# A placeholder that is still there means its variable is missing: fail the start, not the page.
left=
# The cheap fixed-string scan first; the token names are only collected when something is left.
if grep -rqIiF '__NEXT_PUBLIC_' "$ROOT"; then
  left=$(grep -rhoIiE '__NEXT_PUBLIC_[A-Z0-9_]+__' "$ROOT" | sort -u | tr '\n' ' ')
fi
if [ -n "$left" ]; then
  echo "No value for: $left(set the variable, an empty one is fine for an optional value)." >&2
  exit 1
fi
