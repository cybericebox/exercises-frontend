# The rule for the optional installation settings (POSIX sh, sourced). The same file lives in every CyberICEBox frontend (deploy/cfg-check.sh)
# and the copies must stay identical; the same rule is in src/lib/settingRules.ts (next.config), the daemon and the infrastructure renderer,
# and tests/cfg-vectors.json holds the shared vectors.
#
# A URL setting is empty, or https://host[:port][/path][?query]: no whitespace, no quote characters, no < > \ ` and no fragment (#), no
# userinfo (@ in the host). The same rule keeps the value safe inside an HTML attribute and a JavaScript string (the entrypoint writes it into
# both). A flag is true or false.
#
# cfg_url_check NAME and cfg_flag_check NAME return 1 and print the reason to stderr when the variable NAME holds a bad value (an unset or
# empty one is fine).
cfg_url_check() {
  eval "_cc_value=\${$1:-}"
  [ -z "$_cc_value" ] && return 0
  case "$_cc_value" in
    *[[:space:]]* | *'"'* | *"'"* | *'<'* | *'>'* | *'\'* | *'`'* | *'#'*)
      echo "$1 must not contain whitespace, quotes, < > \\ \` or #." >&2
      return 1
      ;;
  esac
  case "$_cc_value" in
    https://*) ;;
    *)
      echo "$1 must be empty or an https:// URL." >&2
      return 1
      ;;
  esac
  _cc_rest=${_cc_value#https://}
  _cc_host=${_cc_rest%%[/?]*}
  if [ -z "$_cc_host" ]; then
    echo "$1 needs a host." >&2
    return 1
  fi
  # Letters, digits, dots and hyphens, with an optional :port (digits); no userinfo.
  if ! printf '%s' "$_cc_host" | grep -Eq '^[A-Za-z0-9.-]+(:[0-9]{1,5})?$'; then
    echo "$1 has an invalid host: $_cc_host" >&2
    return 1
  fi
}

cfg_flag_check() {
  eval "_cc_value=\${$1:-}"
  case "$_cc_value" in
    '' | true | false) ;;
    *)
      echo "$1 must be true or false." >&2
      return 1
      ;;
  esac
}
