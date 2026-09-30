/**
 * placeholderResolve.ts — turn a task's placeholders into concrete strings using
 * a deployed lab's status, so the deploy screen renders the description with real
 * values inline instead of tokens.
 *
 * Placeholder kinds (see PlaceholderDTO):
 *  - vpn.subnet / internet.subnet → the lab's VPN / internet CIDR;
 *  - ip → a subnet-relative address: the CIDR's network with the placeholder's
 *    last octet (for vpn/internet references) or the fixed Octets1to3 (static);
 *  - ip with AsLink → the full URL scheme://ip[:port][path] (no mask);
 *  - external.link → the web-access URL of the named device.
 *
 * ShowMask appends the CIDR mask. An address that cannot be resolved yet (the lab
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

/** The subnet address itself, with or without its mask. */
function subnet(cidr: string, showMask: boolean): string {
  if (showMask) return cidr
  return cidr.split("/")[0] ?? cidr
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
      return status.VPNCIDR ? subnet(status.VPNCIDR, showMask) : ""
    case "internet.subnet":
      return status.InternetCIDR ? subnet(status.InternetCIDR, showMask) : ""
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
