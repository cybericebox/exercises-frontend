import { describe, expect, it } from "vitest"
import type { NormalizedDevice, NormalizedTopology } from "@/api/exercises/versions"
import { labNodeInfo, labTopology } from "./labTopology"

const device = (over: Partial<NormalizedDevice>): NormalizedDevice => ({
  ID: "d1", Name: "web", Type: "container", SecurityPreset: "", Image: "secret/image:1",
  ResourcePreset: "", Resources: { CPURequest: "1", MemoryRequest: "1Gi", CPULimit: "2", MemoryLimit: "2Gi" },
  Interfaces: [{ Name: "eth0", MAC: "", IP: { Type: "static", Addresses: [], AddressRef: { Network: "vpn", Host: 5 }, Gateway: "", Routes: [] } }],
  EnvVars: [{ Name: "FLAG", Value: "ICE{x}", Secret: false, HasValue: true }], External: { Port: 443, Protocol: "https" }, ...over,
})
const topology: NormalizedTopology = {
  VPN: { Enabled: true, DHCP: true }, Internet: { Enabled: false, DHCP: false }, Connections: [], VisualRender: null,
  Devices: [device({}), device({ ID: "d2", Name: "db", External: null, Interfaces: [{ Name: "eth0", MAC: "", IP: { Type: "dhcp", Addresses: [], Gateway: "", Routes: [] } }] })],
}
const status = { Phase: "Ready", Ready: true, VPNCIDR: "10.128.1.0/24", Access: [{ Device: "web", Port: 443, Protocol: "https", URL: "https://web-1" }] }

describe("labTopology", () => {
  it("drops the image, environment and resources of every device", () => {
    const shown = labTopology(topology)
    for (const d of shown.Devices) {
      expect(d.Image).toBe("")
      expect(d.EnvVars).toEqual([])
      expect(d.Resources).toEqual({ CPURequest: "", MemoryRequest: "", CPULimit: "", MemoryLimit: "" })
    }
    expect(JSON.stringify(shown)).not.toMatch(/secret\/image|ICE\{x\}|2Gi/)
  })

  it("reads the external port into the form shape", () => {
    const [web, db] = labTopology(topology).Devices
    expect(web.External).toEqual({ Enabled: true, Port: 443, Protocol: "https" })
    expect(db.External.Enabled).toBe(false)
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

  it("describes the VPN node with the lab's subnet as a CIDR, and hides a disabled network", () => {
    expect(labNodeInfo(topology, "vpn", status)).toEqual({ kind: "vpn", subnet: "10.128.1.0/24", dhcp: true })
    expect(labNodeInfo(topology, "internet", status)).toBeNull()
    expect(labNodeInfo(topology, "nope", status)).toBeNull()
  })
})
