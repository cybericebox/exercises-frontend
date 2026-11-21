// The browser console of a test lab device is a frame on a lab host: <label>.labs.<DOMAIN>. The labs domain is labs.<DOMAIN>
// everywhere in the infrastructure, so every host derives from the same base domain and needs no setting of its own.
//
// The catalog does not know how the lab encodes anything in the host label. Whether a link is a console or a device site is
// stated by the platform API (the access entry of kind terminal that the link was requested for); isConsoleFrameUrl only proves that
// the link stays on the labs domain, in exactly one label. A CSP cannot say more than the whole labs domain, so its frame-src is
// https://*.labs.<DOMAIN> (next.config.ts for `next dev`, deploy/csp.sh for the container, `base_domain_host labs`). Anything
// refused here is offered as «open in a new tab». No path aliases here: next.config.ts imports this file.
//
// An installation whose agents serve labs under another base domain lists those domains in NEXT_PUBLIC_LAB_DOMAINS (comma list). The
// same list widens the CSP (frame-src and form-action, deploy/csp.sh) and this guard (labDomainList, read from the page by
// src/lib/labDomains.ts): a console under one of them is framed by the same one-label rule.

/** labs.<domain> */
export function labsHost(domain: string): string {
  return `labs.${domain}`
}

/** A plain lowercase domain name with at least two labels, at most 253 characters: the rule of deploy/csp.sh for a lab domain. */
const LAB_DOMAIN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)+$/

/**
 * The extra lab base domains of NEXT_PUBLIC_LAB_DOMAINS: a comma list, lowercased, entries that are not plain domain names dropped
 * (the same rule as deploy/csp.sh), no duplicates.
 */
export function labDomainList(value: string | undefined | null): string[] {
  const entries = (value ?? "").split(",").map((entry) => entry.trim().toLowerCase())
  return [...new Set(entries.filter((entry) => entry.length <= 253 && LAB_DOMAIN.test(entry)))]
}

/**
 * The frame-src of the catalog: https://*.labs.<domain>, then https://*.<each extra lab domain> (the widest a CSP can say;
 * isConsoleFrameUrl narrows it to one label).
 */
export function consoleFrameSrc(domain: string | undefined = process.env.NEXT_PUBLIC_DOMAIN, extraLabDomains: string[] = []): string {
  if (!domain) throw new Error("NEXT_PUBLIC_DOMAIN is required")
  return [...new Set([labsHost(domain), ...extraLabDomains])].map((base) => `https://*.${base}`).join(" ")
}

/** The one DNS label in front of labs.<domain>: lowercase letters, digits and inner hyphens. */
const LAB_LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

/**
 * The dev-server `frame-src`: the labs domain, plus (only in the editor fixture mode) the dev page itself and blob: for the
 * canned console page. Never part of a production policy (deploy/csp.sh builds its own and has no blob:).
 */
export function devFrameSrc(domain: string, fixtureMode: boolean, extraLabDomains: string[] = []): string {
  return `${consoleFrameSrc(domain, extraLabDomains)}${fixtureMode ? " 'self' blob:" : ""}`
}

/**
 * Whether a link may be put into an iframe: https, no port, no userinfo, and the host is exactly one DNS label (lowercase
 * letters, digits, hyphens; not starting or ending with a hyphen) under labs.<domain> or under one of the extra lab domains
 * (labDomainList). A deeper subdomain, a lookalike domain, http, a port or userinfo is refused. In the dev fixture mode the canned console page of the dev server (its own origin or
 * blob:) is allowed too.
 */
export function isConsoleFrameUrl(link: string, domain: string | undefined = process.env.NEXT_PUBLIC_DOMAIN, extraLabDomains: string[] = []): boolean {
  let url: URL
  try { url = new URL(link) } catch { return false }
  if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_EDITOR_FIXTURES === "1" && (url.protocol === "blob:" || (typeof window !== "undefined" && url.origin === window.location.origin))) return true
  if (!domain) return false
  if (url.protocol !== "https:" || url.port !== "" || url.username !== "" || url.password !== "") return false
  return [labsHost(domain), ...extraLabDomains].some((base) => {
    const suffix = `.${base}`
    return url.hostname.endsWith(suffix) && LAB_LABEL.test(url.hostname.slice(0, -suffix.length))
  })
}
