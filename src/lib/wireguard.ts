// wg-quick derives the interface name from the config file name, so the part before ".conf" must be a valid interface
// name: at most 15 characters from [a-zA-Z0-9_=+.-]. Every WireGuard config the site offers is named through here
// (the same rule as the event site's utils/wireguard.ts).
const IFNAME_MAX = 15

export function wireguardFileName(base: string): string {
  const name = base.replace(/[^a-zA-Z0-9_=+.-]/g, "-").slice(0, IFNAME_MAX).replace(/-+$/, "") || "wg0"
  return `${name}.conf`
}

/** The studio's one test-lab configuration, as on the event site's participant preview. */
export const TEST_VPN_FILE = wireguardFileName("cybericebox")
