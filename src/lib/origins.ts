// All browser-facing application origins derive from the one public domain.
// NEXT_PUBLIC_{API,ID,ADMIN}_DOMAIN override a single host (bare host, no scheme),
// e.g. to point this app at another backend. Empty origin intentionally means
// same-origin during local development.
const domain = process.env.NEXT_PUBLIC_DOMAIN?.trim() ?? ""
export const publicDomain = domain

const origin = (override: string | undefined, fallback: string) => {
  const host = override?.trim() || fallback
  return host ? `https://${host}` : ""
}

export const apiOrigin = origin(process.env.NEXT_PUBLIC_API_DOMAIN, domain && `api.${domain}`)
export const idOrigin = origin(process.env.NEXT_PUBLIC_ID_DOMAIN, domain && `id.${domain}`)
export const adminOrigin = origin(process.env.NEXT_PUBLIC_ADMIN_DOMAIN, domain && `admin.${domain}`)
export const mainOrigin = domain ? `https://${domain}` : "/"

/**
 * signInURL — the ID app's sign-in page with a return_to back here. Returns ""
 * when the ID host is unknown (NEXT_PUBLIC_DOMAIN unset), so callers never
 * redirect to a same-origin /sign-in this app doesn't have (that loops forever).
 * A return_to that already points at a sign-in page is replaced by this app's root.
 */
export function signInURL(returnTo: string, advertised?: string): string {
  const base = advertised || (idOrigin && `${idOrigin}/sign-in`)
  if (!base) return ""
  let back = returnTo
  try {
    if (new URL(returnTo).pathname.startsWith("/sign-in")) back = new URL("/", returnTo).toString()
  } catch { /* keep as is */ }
  const url = new URL(base)
  url.searchParams.set("return_to", back)
  return url.toString()
}
