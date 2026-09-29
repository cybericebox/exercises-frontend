import { describe, expect, it } from "vitest"
import { emptyDevice, emptyVariant } from "./exerciseSchemas"
import { FORWARDING_PORTS } from "./topologyPorts"
import { topologyDeviceRows } from "./topologyOverview"

function fixture() {
  const topology = emptyVariant(0).Topology
  const web = emptyDevice()
  web.ID = "web-id"
  web.Name = "web"
  const sw = emptyDevice()
  sw.ID = "sw-id"
  sw.Name = "sw"
  sw.Type = "unmanaged-switch"
  sw.Interfaces = []
  const hub = emptyDevice()
  hub.ID = "hub-id"
  hub.Name = "hub"
  hub.Type = "hub"
  hub.Interfaces = []
  topology.Devices = [web, sw, hub]
  topology.VPN.Enabled = true
  topology.Internet.Enabled = true
  return topology
}

describe("topologyDeviceRows", () => {
  it("counts only declared container ports and marks network-node exposure inapplicable", () => {
    const topology = fixture()
    topology.Devices[0].Interfaces = []
    topology.Devices[0].External.Enabled = true
    const rows = topologyDeviceRows(topology)
    expect(rows.map((row) => [row.key, row.capacity, row.used, row.free, row.linkCount])).toEqual([
      ["web-id", 0, 0, 0, 0],
      ["sw-id", 48, 0, 48, 0],
      ["hub-id", 48, 0, 48, 0],
      ["vpn", 1, 0, 1, 0],
      ["internet", 1, 0, 1, 0],
    ])
    expect(rows[0].externalEnabled).toBe(true)
    expect(rows.slice(1).every((row) => row.externalEnabled === null)).toBe(true)
  })

  it("counts occupied valid ports once and distinct connection records", () => {
    const topology = fixture()
    topology.Devices[0].Interfaces.push({ ...topology.Devices[0].Interfaces[0], Name: "eth1" })
    topology.Connections = [
      { Endpoints: [
        { Kind: "device", DeviceID: "web-id", Interface: "eth0" },
        { Kind: "device", DeviceID: "sw-id", Interface: FORWARDING_PORTS[0] },
      ] },
      { Endpoints: [
        { Kind: "device", DeviceID: "web-id", Interface: "eth1" },
        { Kind: "vpn", DeviceID: "", Interface: "eth0" },
      ] },
      { Endpoints: [
        { Kind: "device", DeviceID: "web-id", Interface: "eth0" },
        { Kind: "device", DeviceID: "missing", Interface: "eth0" },
      ] },
    ]
    const rows = topologyDeviceRows(topology)
    expect(rows.find((row) => row.key === "web-id")).toMatchObject({ capacity: 2, used: 2, free: 0, linkCount: 3 })
    expect(rows.find((row) => row.key === "sw-id")).toMatchObject({ capacity: 48, used: 1, free: 47, linkCount: 1 })
    expect(rows.find((row) => row.key === "vpn")).toMatchObject({ capacity: 1, used: 1, free: 0, linkCount: 1 })
  })

  it("caps a 48-port switch at zero free when all ports are used", () => {
    const topology = fixture()
    topology.Connections = FORWARDING_PORTS.map((port) => ({ Endpoints: [
      { Kind: "device" as const, DeviceID: "sw-id", Interface: port },
      { Kind: "device" as const, DeviceID: "", Interface: "" },
    ] }))
    expect(topologyDeviceRows(topology).find((row) => row.key === "sw-id")).toMatchObject({ capacity: 48, used: 48, free: 0, linkCount: 48 })
  })
})
