#!/bin/sh
# Runtime env substitution for the static export. The build baked each
# NEXT_PUBLIC_* value as a placeholder equal to its variable name; here we
# replace those placeholders with the actual runtime env values so the same
# image works across environments without a rebuild.
set -e

ROOT=/usr/share/nginx/html

# Every host is required: no derivation, no fallback.
for name in NEXT_PUBLIC_MAIN_HOST NEXT_PUBLIC_API_HOST NEXT_PUBLIC_ID_HOST NEXT_PUBLIC_ADMIN_HOST NEXT_PUBLIC_EXERCISES_HOST NEXT_PUBLIC_EVENT_DOMAIN; do
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    echo "$name is required." >&2
    exit 1
  fi
done
# Analytics is optional; the build folded the placeholder, so empty is set here.
: "${NEXT_PUBLIC_GOOGLE_ANALYTICS_ID:=}"
export NEXT_PUBLIC_GOOGLE_ANALYTICS_ID

printenv | grep '^NEXT_PUBLIC_' | while IFS='=' read -r key value; do
  # Escape sed-special chars in the replacement (| delimiter, & match-ref, \).
  esc=$(printf '%s' "$value" | sed -e 's/[\\&|]/\\&/g')
  find "$ROOT" -type f \( -name '*.js' -o -name '*.html' -o -name '*.css' -o -name '*.txt' \) \
    -exec sed -i "s|${key}|${esc}|g" {} +
done
