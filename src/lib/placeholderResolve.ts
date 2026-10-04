/**
 * placeholderResolve.ts — turn a task's placeholders into concrete strings using
 * a deployed lab's status, so the deploy screen renders the description with real
 * values inline instead of tokens.
 *
 * Placeholder kinds (see PlaceholderDTO):
 *  - vpn.subnet / internet.subnet → the lab's VPN / internet CIDR, always with its mask
 *    (10.128.1.0/24): a subnet without a mask is not a subnet;
 *  - ip → a subnet-relative address: the CIDR's network with the placeholder's
 *    last octet (for vpn/internet references) or the fixed Octets1to3 (static);
 *  - ip with AsLink → the full URL scheme://ip[:port][path] (no mask);
 *  - external.link → the web-access URL of the named device.
 *
 * ShowMask appends the CIDR mask to an ip. An address that cannot be resolved yet (the lab
 * has no such CIDR / access entry) resolves to "" so the UI can show a fallback.
 */
import type { PlaceholderDTO } from "@/api/exercises/versions"
import type { DeployStatus } from "@/api/exercises/deploy"
import { buildLinkUrl } from "@/lib/placeholderLink"

/** Split "10.128.1.0/24" into its first three octets and mask. */
function parseCIDR(cidr: string): { network3: string; mask: string } | null {
  const [addr, mask] = cidr.split("/")
  if (!addr || !mask) return null
  const octets = addr.split(".")
  if (octets.length !== 4) return null
  return { network3: octets.slice(0, 3).join("."), mask }
}

/** A subnet-relative address: network's first three octets + lastOctet (+ mask). */
function ipFromCIDR(cidr: string, lastOctet: number, showMask: boolean): string {
  const parsed = parseCIDR(cidr)
  if (!parsed) return ""
  const ip = `${parsed.network3}.${lastOctet}`
  return showMask ? `${ip}/${parsed.mask}` : ip
}

/** Resolve a single placeholder against a deployed lab's status. */
export function resolvePlaceholder(p: PlaceholderDTO, status: DeployStatus): string {
  if (p.Kind === "ip" && p.AsLink) {
    const ip = resolvePlaceholder({ ...p, AsLink: false, ShowMask: false }, status)
    return ip ? buildLinkUrl(p.Scheme || "http", ip, p.Port, p.Path) : ""
  }
  const lastOctet = p.LastOctet ?? 0
  const showMask = p.ShowMask ?? false

  switch (p.Kind) {
    case "vpn.subnet":
      return status.VPNCIDR ?? ""
    case "internet.subnet":
      return status.InternetCIDR ?? ""
    case "ip":
      switch (p.IPReference) {
        case "vpn":
          return status.VPNCIDR ? ipFromCIDR(status.VPNCIDR, lastOctet, showMask) : ""
        case "internet":
          return status.InternetCIDR ? ipFromCIDR(status.InternetCIDR, lastOctet, showMask) : ""
        case "static":
          return p.Octets1to3 ? `${p.Octets1to3}.${lastOctet}` : ""
        default:
          return ""
      }
    case "external.link": {
      const entry = status.Access?.find((a) => a.Device === p.DeviceName)
      return entry?.URL ?? ""
    }
    default:
      return ""
  }
}

/**
 * Resolve every placeholder of a task, positionally: the description's placeholder
 * nodes carry the array index, so the renderer maps node index → resolved string.
 */
export function resolvePlaceholders(placeholders: PlaceholderDTO[] | undefined, status: DeployStatus): string[] {
  return (placeholders ?? []).map((p) => resolvePlaceholder(p, status))
}

/** A web device of the lab a variable stands for: opens through the platform proxy link. */
export type ExternalTarget = { device: string; port: number }

export type TaskValues = {
  /** Text a variable shows, by variable key; unresolved ones show a dash. */
  variables: Record<string, string>
  /** Variables that are plain links (name → URL): an ip written as a link. */
  links: Record<string, string>
  /** Variables that are buttons opening a web device of the lab through the proxy. */
  external: Record<string, ExternalTarget>
}

/** Shown in place of a value the lab has not produced. */
export const UNRESOLVED = "—"

/**
 * The values a participant would see for a task's variables in this lab: text per
 * key, which are links, and which are proxy buttons (external.link).
 */
export function taskValues(placeholders: PlaceholderDTO[] | undefined, status: DeployStatus): TaskValues {
  const out: TaskValues = { variables: {}, links: {}, external: {} }
  for (const placeholder of placeholders ?? []) {
    const key = placeholder.Key
    if (!key) continue
    const value = resolvePlaceholder(placeholder, status)
    if (placeholder.Kind === "external.link") {
      const entry = status.Access?.find((access) => access.Device === placeholder.DeviceName)
      out.variables[key] = value || UNRESOLVED
      if (entry) out.external[key] = { device: entry.Device, port: entry.Port }
    } else if (placeholder.Kind === "ip" && placeholder.AsLink && value) {
      out.variables[key] = value
      out.links[key] = value
    } else {
      out.variables[key] = value || UNRESOLVED
    }
  }
  return out
}
