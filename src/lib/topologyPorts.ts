import type { TopologyFormValues } from "@/lib/exerciseSchemas"

export const GATEWAY_PORT = "eth0" as const

export const FORWARDING_PORTS = Object.freeze(Array.from(
  { length: 48 }, (_, index) => `GigabitEthernet0/${index + 1}`,
))

export function isForwardingPort(name: string): boolean {
  return FORWARDING_PORTS.includes(name)
}

export function shortForwardingPort(name: string): string {
  return isForwardingPort(name) ? name.replace("GigabitEthernet", "Gi") : name
}

export function availableForwardingPorts(
  topology: Pick<TopologyFormValues, "Connections">,
  deviceID: string,
  editing?: { connectionIndex: number; side: number },
): string[] {
  const used = usedDevicePorts(topology, deviceID, editing)
  return FORWARDING_PORTS.filter((port) => !used.has(port))
}

export function availableDevicePorts(
  topology: Pick<TopologyFormValues, "Connections">,
  device: TopologyFormValues["Devices"][number],
  editing?: { connectionIndex: number; side: number },
): string[] {
  if (device.Type === "unmanaged-switch" || device.Type === "hub") {
    return availableForwardingPorts(topology, device.ID, editing)
  }
  const used = usedDevicePorts(topology, device.ID, editing)
  return device.Interfaces.map((iface) => iface.Name).filter((port) => !used.has(port))
}

function usedDevicePorts(
  topology: Pick<TopologyFormValues, "Connections">,
  deviceID: string,
  editing?: { connectionIndex: number; side: number },
): Set<string> {
  const used = new Set<string>()
  topology.Connections.forEach((connection, connectionIndex) => {
    connection.Endpoints.forEach((endpoint, side) => {
      if (endpoint.Kind === "device" && endpoint.DeviceID === deviceID &&
        !(editing?.connectionIndex === connectionIndex && editing.side === side)) {
        used.add(endpoint.Interface)
      }
    })
  })
  return used
}
