import type { PlaceholderFormValues } from "@/lib/exerciseSchemas"

/**
 * placeholderLink.ts — the link form of the IP constructor: scheme://ip[:port][path].
 * Rules mirror the server's ipLinkInvalid (internal/model/exercise/placeholder.go).
 */
export const LINK_SCHEMES = ["http", "https"] as const
export const MAX_LINK_PATH = 200

/** Port text: empty means the scheme default, otherwise an integer 1..65535. */
export function isValidLinkPort(port: string): boolean {
  if (port === "") return true
  if (!/^\d{1,5}$/.test(port)) return false
  const value = Number(port)
  return value >= 1 && value <= 65535
}

/** Path text: empty, or starts with "/", no spaces, quotes or angle brackets, up to 200 chars. */
export function isValidLinkPath(path: string): boolean {
  if (path === "") return true
  return path.length <= MAX_LINK_PATH && path.startsWith("/") && !/[\s"'`<>\\]/.test(path)
}

/** Build the full URL from an already resolved IP. */
export function buildLinkUrl(scheme: string, ip: string, port?: number | string, path?: string): string {
  const portPart = port !== undefined && port !== "" && Number(port) > 0 ? `:${Number(port)}` : ""
  return `${scheme}://${ip}${portPart}${path ?? ""}`
}

/** Editor example of an IP placeholder: a plain address, with mask, or the link form. */
export function ipExample(p: PlaceholderFormValues): string {
  const ip = p.IPReference === "static" && p.Octets1to3 ? `${p.Octets1to3}.${p.LastOctet}` : `10.0.0.${p.LastOctet}`
  if (p.AsLink) return buildLinkUrl(p.Scheme || "http", ip, p.PortText, p.Path)
  return p.IPReference === "static" && p.Octets1to3 ? ip : `${ip}${p.ShowMask ? "/24" : ""}`
}
