// The one origin the catalog may frame: the browser console of a test lab. The labs domain is labs.<DOMAIN> everywhere in the
// infrastructure and the console host is `terminal`, so the origin derives from the same base domain as every other host and
// needs no setting of its own. The CSP (next.config.ts for `next dev`, deploy/csp.sh for the container: `base_domain_host
// terminal.labs`) and the check before a console link goes into an iframe both use this rule. No wildcard, no http.
// No path aliases here: next.config.ts imports this file.

/** terminal.labs.<domain> */
export function consoleFrameHost(domain: string): string {
  return `terminal.labs.${domain}`
}

/** https://terminal.labs.<domain>, the only frame-src of the catalog. */
export function consoleFrameOrigin(domain: string | undefined = process.env.NEXT_PUBLIC_DOMAIN): string {
  if (!domain) throw new Error("NEXT_PUBLIC_DOMAIN is required")
  return `https://${consoleFrameHost(domain)}`
}

/**
 * The dev-server `frame-src`: the console origin, plus (only in the editor fixture mode) the dev page itself and blob: for
 * the canned console page. Never part of a production policy (deploy/csp.sh builds its own and has no blob:).
 */
export function devFrameSrc(domain: string, fixtureMode: boolean): string {
  return `${consoleFrameOrigin(domain)}${fixtureMode ? " 'self' blob:" : ""}`
}

/**
 * Whether a console link may be put into an iframe: https and exactly the console origin (no port, no userinfo). Anything
 * else must be offered as «open in a new tab». In the dev fixture mode the canned console page of the dev server is allowed too.
 */
export function isConsoleFrameUrl(link: string, domain: string | undefined = process.env.NEXT_PUBLIC_DOMAIN): boolean {
  let url: URL
  try { url = new URL(link) } catch { return false }
  if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_EDITOR_FIXTURES === "1" && (url.protocol === "blob:" || (typeof window !== "undefined" && url.origin === window.location.origin))) return true
  if (!domain) return false
  return url.protocol === "https:" && url.username === "" && url.password === "" && url.origin === consoleFrameOrigin(domain)
}
