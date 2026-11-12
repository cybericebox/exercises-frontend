// The browser console of a test lab device is a frame on its own host: <device>-<code>--term.labs.<DOMAIN> (later --vnc and
// --rdp). The labs domain is labs.<DOMAIN> everywhere in the infrastructure, so every host derives from the same base domain and
// needs no setting of its own.
//
// A CSP cannot express «one label ending in --term», so its frame-src is the whole labs domain, https://*.labs.<DOMAIN> (the
// CSP is next.config.ts for `next dev` and deploy/csp.sh for the container, `base_domain_host labs`); the real guard is
// isConsoleFrameUrl below, which package D calls before a link is put into an iframe. Anything it refuses is offered as «open
// in a new tab». No path aliases here: next.config.ts imports this file.

/** labs.<domain> */
export function labsHost(domain: string): string {
  return `labs.${domain}`
}

/** https://*.labs.<domain>: the frame-src of the catalog (the widest a CSP can say; isConsoleFrameUrl narrows it). */
export function consoleFrameSrc(domain: string | undefined = process.env.NEXT_PUBLIC_DOMAIN): string {
  if (!domain) throw new Error("NEXT_PUBLIC_DOMAIN is required")
  return `https://*.${labsHost(domain)}`
}

/** One label of a console host: <device>-<code>--term. */
const CONSOLE_LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?--term$/

/**
 * The dev-server `frame-src`: the labs domain, plus (only in the editor fixture mode) the dev page itself and blob: for the
 * canned console page. Never part of a production policy (deploy/csp.sh builds its own and has no blob:).
 */
export function devFrameSrc(domain: string, fixtureMode: boolean): string {
  return `${consoleFrameSrc(domain)}${fixtureMode ? " 'self' blob:" : ""}`
}

/**
 * Whether a console link may be put into an iframe: https, no port, no userinfo, and the host is exactly one label ending in
 * `--term` under labs.<domain>. A device web host (without the suffix), a deeper subdomain, a lookalike suffix, `--vnc` or
 * `--rdp` is refused. In the dev fixture mode the canned console page of the dev server (its own origin or blob:) is allowed too.
 */
export function isConsoleFrameUrl(link: string, domain: string | undefined = process.env.NEXT_PUBLIC_DOMAIN): boolean {
  let url: URL
  try { url = new URL(link) } catch { return false }
  if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_EDITOR_FIXTURES === "1" && (url.protocol === "blob:" || (typeof window !== "undefined" && url.origin === window.location.origin))) return true
  if (!domain) return false
  if (url.protocol !== "https:" || url.port !== "" || url.username !== "" || url.password !== "") return false
  const suffix = `.${labsHost(domain)}`
  if (!url.hostname.endsWith(suffix)) return false
  return CONSOLE_LABEL.test(url.hostname.slice(0, -suffix.length))
}
