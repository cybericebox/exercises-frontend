import type { TopologyFormValues } from "./exerciseSchemas"
import { FORWARDING_PORTS, GATEWAY_PORT } from "./topologyPorts"

export type TopologyDeviceRow = {
  key: string
  name: string
  type: "container" | "unmanaged-switch" | "hub" | "vpn" | "internet"
  capacity: number
  used: number
  free: number
  linkCount: number
  externalEnabled: boolean | null
}

/** Read-only overview of the same form model used by the diagram and editor. */
export function topologyDeviceRows(topology: TopologyFormValues): TopologyDeviceRow[] {
  const rows: TopologyDeviceRow[] = topology.Devices.map((device) => {
    const ports = device.Type === "container"
      ? device.Interfaces.map((iface) => iface.Name).filter(Boolean)
      : FORWARDING_PORTS
    return {
      key: device.ID,
      name: device.Name,
      type: device.Type,
      capacity: new Set(ports).size,
      used: 0,
      free: 0,
      linkCount: 0,
      externalEnabled: device.Type === "container" ? device.External.Enabled : null,
    }
  })
  if (topology.VPN.Enabled) rows.push({ key: "vpn", name: "", type: "vpn", capacity: 1, used: 0, free: 0, linkCount: 0, externalEnabled: null })
  if (topology.Internet.Enabled) rows.push({ key: "internet", name: "", type: "internet", capacity: 1, used: 0, free: 0, linkCount: 0, externalEnabled: null })

  for (const row of rows) {
    const validPorts = row.type === "vpn" || row.type === "internet" ? new Set([GATEWAY_PORT])
      : row.type === "container" ? new Set(topology.Devices.find((device) => device.ID === row.key)?.Interfaces.map((iface) => iface.Name).filter(Boolean))
      : new Set(FORWARDING_PORTS)
    const used = new Set<string>()
    for (const connection of topology.Connections) {
      const endpoints = connection.Endpoints.filter((endpoint) => row.type === "vpn" || row.type === "internet"
        ? endpoint.Kind === row.type
        : endpoint.Kind === "device" && endpoint.DeviceID === row.key)
      if (endpoints.length === 0) continue
      row.linkCount++
      for (const endpoint of endpoints) if (validPorts.has(endpoint.Interface)) used.add(endpoint.Interface)
    }
    row.used = used.size
    row.free = Math.max(0, row.capacity - row.used)
  }
  return rows
}
