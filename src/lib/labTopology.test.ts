import { describe, expect, it } from "vitest"
import type { NormalizedDevice, NormalizedTopology } from "@/api/exercises/versions"
import { labNodeInfo, labTopology } from "./labTopology"
import { normalizedDevice, normalizedTopology } from "@/test/editorFixtures"

const device = (over: Partial<NormalizedDevice>): NormalizedDevice => normalizedDevice({
  ID: "d1", Name: "web", Image: "secret/image:1",
  ResourcePreset: "max",
  Interfaces: [{ Name: "eth0", MAC: "", IP: { Type: "static", Addresses: [], AddressRef: { Gateway: "attack", Host: 5 }, Gateway: "", Routes: [] } }],
  Bootstrap: { Timeout: "", Env: [{ Name: "FLAG", Value: "ICE{x}", Secret: false, HasValue: true }], Files: [], Script: "", Interpreter: "" },
  Access: [{ Kind: "http", Port: 443, Protocol: "https" }], ...over,
})
const topology: NormalizedTopology = normalizedTopology({
  Devices: [
    device({}), device({ ID: "d2", Name: "db", Access: [], Interfaces: [{ Name: "eth0", MAC: "", IP: { Type: "dhcp", Addresses: [], Gateway: "", Routes: [] } }] }),
    normalizedDevice({ ID: "g1", Name: "attack", Type: "vpn_gateway", DHCP: true, DHCPRanges: [{ Start: 100, End: 200 }] }),
    normalizedDevice({ ID: "g2", Name: "out", Type: "internet_gateway", DHCP: false }),
    normalizedDevice({ ID: "g3", Name: "attack-2", Type: "vpn_gateway", DHCP: false, ReverseConnections: true }),
  ],
})
const status = {
  Phase: "Ready", Ready: true,
  Gateways: [
    { Name: "attack", Kind: "vpn" as const, CIDR: "10.128.1.0/24", Ready: true, Reverse: "blocked" },
    { Name: "out", Kind: "internet" as const, CIDR: "10.128.2.0/24", Ready: false },
  ],
  Access: [{ Device: "web", Port: 443, Protocol: "https", URL: "https://web-1" }],
}

describe("labTopology", () => {
  it("drops the image, environment and resources of every device", () => {
    const shown = labTopology(topology)
    for (const d of shown.Devices) {
      expect(d.Image).toBe("")
      expect(d.Bootstrap.Env).toEqual([])
      expect(d.ResourcePreset).toBe("")
    }
    expect(JSON.stringify(shown)).not.toMatch(/secret\/image|ICE\{x\}|max/)
  })

  it("reads the web access into the form shape", () => {
    const [web, db] = labTopology(topology).Devices
    expect(web.Access).toEqual([{ Kind: "http", Port: "443", Protocol: "https", Command: "", User: "" }])
    expect(db.Access).toEqual([])
  })
})

describe("labNodeInfo", () => {
  it("resolves a device's lab address, services and web access", () => {
    const info = labNodeInfo(topology, "d1", status)
    expect(info).toMatchObject({ kind: "device", name: "web", interfaces: [{ name: "eth0", address: "10.128.1.5", dhcp: false }], services: ["443/https"] })
    expect(info?.kind === "device" && info.web.map((w) => w.Device)).toEqual(["web"])
  })

  it("marks a DHCP interface and shows no service for a device without an external port", () => {
    expect(labNodeInfo(topology, "d2", status)).toMatchObject({ interfaces: [{ dhcp: true, address: null }], services: [], web: [] })
  })

  it("describes a gateway by its device id: its own subnet as a CIDR, DHCP, readiness and (VPN) the reverse state", () => {
    expect(labNodeInfo(topology, "g1", status)).toEqual({ kind: "vpn", name: "attack", subnet: "10.128.1.0/24", dhcp: true, ready: true, reverse: "blocked" })
    expect(labNodeInfo(topology, "g2", status)).toEqual({ kind: "internet", name: "out", subnet: "10.128.2.0/24", dhcp: false, ready: false })
  })

  it("knows nothing live about a gateway the status does not list yet, and nothing about a missing node or the old vpn / internet keys", () => {
    expect(labNodeInfo(topology, "g3", status)).toEqual({ kind: "vpn", name: "attack-2", subnet: null, dhcp: false, ready: null })
    expect(labNodeInfo(topology, "g1", null)).toMatchObject({ subnet: null, ready: null })
    expect(labNodeInfo(topology, "vpn", status)).toBeNull()
    expect(labNodeInfo(topology, "nope", status)).toBeNull()
  })
})
