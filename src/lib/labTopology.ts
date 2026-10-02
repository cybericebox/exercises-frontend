/**
 * labTopology.ts — a variant's topology for the test page's read-only panel.
 * The panel shows the network and what a participant may reach; it never carries
 * a device's image, environment, resources or flag: those are dropped here, before
 * anything is rendered.
 */
import type { DeployAccess, DeployStatus } from "@/api/exercises/deploy"
import type { NormalizedDevice, NormalizedTopology } from "@/api/exercises/versions"
import type { TopologyFormValues } from "@/lib/exerciseSchemas"

const NO_RESOURCES = { CPURequest: "", MemoryRequest: "", CPULimit: "", MemoryLimit: "" }

/** The diagram's model of the variant's topology, without anything private. */
export function labTopology(topology: NormalizedTopology): TopologyFormValues {
  return {
    ...topology,
    Devices: topology.Devices.map((device) => ({
      ...device,
      Image: "",
      EnvVars: [],
      ResourcePreset: "",
      Resources: NO_RESOURCES,
      Persistence: undefined,
      External: device.External ? { Enabled: true, ...device.External } : { Enabled: false, Port: 80, Protocol: "http" as const },
    })),
  }
}

export type InterfaceAddress = { name: string; address: string | null; dhcp: boolean }

export type LabNodeInfo =
  | { kind: "device"; name: string; type: NormalizedDevice["Type"]; interfaces: InterfaceAddress[]; services: string[]; web: DeployAccess[] }
  | { kind: "vpn" | "internet"; subnet: string | null; dhcp: boolean }

/** `10.128.1.0/24` + host 5 → `10.128.1.5`. */
function hostIn(cidr: string | undefined, host: number): string | null {
  const address = cidr?.split("/")[0]?.split(".")
  return address?.length === 4 ? `${address.slice(0, 3).join(".")}.${host}` : null
}

/** What the card of one node shows; null for an unknown node. */
export function labNodeInfo(topology: NormalizedTopology, key: string, status: DeployStatus | null): LabNodeInfo | null {
  if (key === "vpn" || key === "internet") {
    const network = key === "vpn" ? topology.VPN : topology.Internet
    if (!network.Enabled) return null
    return { kind: key, subnet: (key === "vpn" ? status?.VPNCIDR : status?.InternetCIDR) ?? null, dhcp: network.DHCP }
  }
  const device = topology.Devices.find((candidate) => candidate.ID === key)
  if (!device) return null
  const interfaces = device.Interfaces.map((iface): InterfaceAddress => {
    const ip = iface.IP
    if (ip.Type === "dhcp") return { name: iface.Name, address: null, dhcp: true }
    if (ip.AddressRef) {
      const cidr = ip.AddressRef.Network === "vpn" ? status?.VPNCIDR : status?.InternetCIDR
      return { name: iface.Name, address: hostIn(cidr, ip.AddressRef.Host), dhcp: false }
    }
    return { name: iface.Name, address: ip.Addresses[0]?.split("/")[0] ?? null, dhcp: false }
  }).filter((entry) => entry.dhcp || entry.address)
  return {
    kind: "device", name: device.Name, type: device.Type, interfaces,
    services: device.External ? [`${device.External.Port}/${device.External.Protocol}`] : [],
    web: (status?.Access ?? []).filter((access) => access.Device === device.Name),
  }
}
