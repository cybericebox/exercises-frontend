// The rule for the optional installation settings (one rule everywhere: deploy/cfg-check.sh, next.config.ts, the Pages workflow, the
// daemon and the infrastructure renderer; tests/cfg-vectors.json holds the shared vectors, identical in every repository).
//
// A URL setting is empty, or `https://host[:port][/path][?query]`: no whitespace, no quote characters, no < > \ ` and no fragment (#), no
// userinfo (@ in the host). The same rule keeps the value safe inside an HTML attribute and a JavaScript string. A flag is `true` or `false`.
// Returns the reason, or null when the value is valid.
export function urlSettingError(value: string): string | null {
  if (value === "") return null
  if (/[\s"'<>\\`#]/.test(value)) return "must not contain whitespace, quotes, < > \\ ` or #"
  const match = /^https:\/\/([^/?]*)(.*)$/.exec(value)
  if (!match) return "must be empty or an https:// URL"
  const host = match[1]
  if (host === "") return "needs a host"
  if (!/^[A-Za-z0-9.-]+(:[0-9]{1,5})?$/.test(host)) return "has an invalid host (no userinfo, letters, digits, dots, hyphens and an optional port)"
  return null
}

export function flagSettingError(value: string): string | null {
  return value === "" || value === "true" || value === "false" ? null : "must be true or false"
}
