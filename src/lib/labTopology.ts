/**
 * labTopology.ts — a variant's topology for the test page's read-only panel.
 * The panel shows the network and what a participant may reach; it never carries
 * a device's image, environment, resources or flag: those are dropped here, before
 * anything is rendered.
 */
import type { DeployAccess, DeployStatus } from "@/api/exercises/deploy"
import { type NormalizedDevice, type NormalizedTopology } from "@/api/exercises/versions"
import { gatewayKindOf, isGatewayType, type GatewayKind } from "@/lib/gatewayTypes"
import { emptyBootstrap, topologyToForm, type TopologyFormValues } from "@/lib/editor/schemas/infra"

/** The diagram's model of the variant's topology, without anything private. */
export function labTopology(topology: NormalizedTopology): TopologyFormValues {
  const form = topologyToForm(topology)
  return {
    ...form,
    Devices: form.Devices.map((device) => ({
      ...device,
      Image: "",
      Command: [],
      Args: [],
      Bootstrap: emptyBootstrap(),
      ResourcePreset: "",
      Persistence: undefined,
      WaitReadyFile: false,
    })),
  }
}

export type InterfaceAddress = { name: string; address: string | null; dhcp: boolean }

export type LabNodeInfo =
  | { kind: "device"; name: string; type: NormalizedDevice["Type"]; interfaces: InterfaceAddress[]; services: string[]; web: DeployAccess[] }
  | { kind: GatewayKind; name: string; subnet: string | null; dhcp: boolean; ready: boolean | null; /** VPN gateway: what is in force for connections the lab starts to the participants; absent when unknown. */ reverse?: string }

/** `10.128.1.0/24` + host 5 → `10.128.1.5`. */
function hostIn(cidr: string | undefined, host: number): string | null {
  const address = cidr?.split("/")[0]?.split(".")
  return address?.length === 4 ? `${address.slice(0, 3).join(".")}.${host}` : null
}

/** What the card of one node shows (the key is the device ID, a gateway included); null for an unknown node. */
export function labNodeInfo(topology: NormalizedTopology, key: string, status: DeployStatus | null): LabNodeInfo | null {
  const device = topology.Devices.find((candidate) => candidate.ID === key)
  if (!device) return null
  const gatewayOf = (name: string) => status?.Gateways?.find((gateway) => gateway.Name === name)
  if (isGatewayType(device.Type)) {
    const live = gatewayOf(device.Name)
    return {
      kind: gatewayKindOf(device.Type), name: device.Name, subnet: live?.CIDR ?? null, dhcp: device.DHCP, ready: live?.Ready ?? null,
      ...(device.Type === "vpn_gateway" && live?.Reverse ? { reverse: live.Reverse } : {}),
    }
  }
  const interfaces = device.Interfaces.map((iface): InterfaceAddress => {
    const ip = iface.IP
    if (ip.Type === "dhcp") return { name: iface.Name, address: null, dhcp: true }
    if (ip.AddressRef) return { name: iface.Name, address: hostIn(gatewayOf(ip.AddressRef.Gateway)?.CIDR, ip.AddressRef.Host), dhcp: false }
    return { name: iface.Name, address: ip.Addresses[0]?.split("/")[0] ?? null, dhcp: false }
  }).filter((entry) => entry.dhcp || entry.address)
  return {
    kind: "device", name: device.Name, type: device.Type, interfaces,
    services: device.Access.filter((entry) => entry.Kind === "http" && entry.Port).map((entry) => `${entry.Port}/${entry.Protocol ?? "http"}`),
    web: (status?.Access ?? []).filter((access) => access.Device === device.Name),
  }
}
