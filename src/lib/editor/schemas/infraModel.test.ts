import { describe, expect, it, vi } from "vitest"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))

import { bootstrapToDTO, emptyAccess, emptyBootstrap, emptyDevice, emptyGateway, emptyTopology, interfaceNameError, topologySchema, topologyToDTO, topologyToForm, type DeviceFormValues } from "./infra"
import type { NormalizedTopology } from "@/api/exercises/versions"
import { normalizedDevice } from "@/test/editorFixtures"

const device = (overrides: Partial<DeviceFormValues> = {}): DeviceFormValues => ({ ...emptyDevice(), ID: "d1", Name: "web", ...overrides })
const messages = (topology = emptyTopology()) => { const result = topologySchema.safeParse(topology); return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) }

describe("access list", () => {
  it("sends one entry per kind: a web port with the protocol, a terminal with its command and user", () => {
    const topology = { ...emptyTopology(), Devices: [device({ Access: [
      { ...emptyAccess("http"), Port: "8443", Protocol: "https" },
      { ...emptyAccess("terminal"), Command: "/bin/bash", User: "ctf" },
    ] })] }
    expect(topologyToDTO(topology).Devices?.[0]?.Access).toEqual([{ Kind: "http", Port: 8443, Protocol: "https" }, { Kind: "terminal", Command: "/bin/bash", User: "ctf" }])
  })

  it("rejects the same kind twice and a port out of range", () => {
    const topology = { ...emptyTopology(), Devices: [device({ Access: [{ ...emptyAccess("http"), Port: "0" }, emptyAccess("http")] })] }
    const found = messages(topology)
    expect(found).toContain("Devices.0.Access.1.Kind: ed.c.val.accessKindOnce")
    expect(found).toContain("Devices.0.Access.0.Port: ed.c.val.accessPortWeb")
  })

  it("keeps an empty terminal entry as «on» with the image's defaults", () => {
    const topology = { ...emptyTopology(), Devices: [device({ Access: [emptyAccess("terminal")] })] }
    expect(topologyToDTO(topology).Devices?.[0]?.Access).toEqual([{ Kind: "terminal" }])
    expect(messages(topology)).toEqual([])
  })
})

describe("secrets of the environment", () => {
  it("sends a saved secret with an empty value: the server keeps what it stores", () => {
    const dto = bootstrapToDTO({ ...emptyBootstrap(), Env: [{ Name: "DB_PASS", Value: "", Secret: true, HasValue: true }] })
    expect(dto?.Env).toEqual([{ Name: "DB_PASS", Value: "", Secret: true }])
  })

  it("drops an unfinished row and keeps a row with only a value for the name error to point at", () => {
    const dto = bootstrapToDTO({ ...emptyBootstrap(), Env: [{ Name: "", Value: "", Secret: false, HasValue: false }, { Name: "", Value: "x", Secret: false, HasValue: false }] })
    expect(dto?.Env).toHaveLength(1)
  })

  it("requires a value for a new secret but not for a saved one", () => {
    const base = (env: DeviceFormValues["Bootstrap"]["Env"]) => ({ ...emptyTopology(), Devices: [device({ Bootstrap: { ...emptyBootstrap(), Env: env } })] })
    expect(messages(base([{ Name: "A", Value: "", Secret: true, HasValue: false }]))).toContain("Devices.0.Bootstrap.Env.0.Value: admin.ex.val.secretValue")
    expect(messages(base([{ Name: "A", Value: "", Secret: true, HasValue: true }]))).not.toContain("Devices.0.Bootstrap.Env.0.Value: admin.ex.val.secretValue")
  })

  it("round-trips a text file and an uploaded file of the initialization", () => {
    const bootstrap = { ...emptyBootstrap(), Files: [
      { Path: "/a", From: "text" as const, Content: "x", Source: null, Owner: "", Group: "", Mode: "" },
      { Path: "/b", From: "file" as const, Content: "", Source: { FileID: "f", Name: "b.bin" }, Owner: "root", Group: "", Mode: "0400" },
    ] }
    expect(bootstrapToDTO(bootstrap)?.Files).toEqual([{ Path: "/a", Content: "x" }, { Path: "/b", Source: { FileID: "f", Name: "b.bin" }, Owner: "root", Mode: "0400" }])
  })
})

describe("names", () => {
  it("checks an interface name: filled, 15 characters, letters digits . _ -, unique on the device", () => {
    expect(interfaceNameError("", [])).toBe("ed.c.val.ifaceRequired")
    expect(interfaceNameError("a".repeat(16), [])).toBe("ed.c.val.ifaceLength")
    expect(interfaceNameError("eth 0", [])).toBe("ed.c.val.ifaceChars")
    expect(interfaceNameError("eth0", ["eth0"])).toBe("ed.c.val.ifaceDuplicate")
    expect(interfaceNameError("br-lan.10_a", ["eth0"])).toBe("")
  })

  it("reports an interface name error and a duplicate device name at their own fields", () => {
    const first = device({ Interfaces: [{ ...emptyDevice().Interfaces[0], Name: "eth0" }, { ...emptyDevice().Interfaces[0], Name: "eth0" }] })
    const found = messages({ ...emptyTopology(), Devices: [first, device({ ID: "d2" })] })
    expect(found).toContain("Devices.0.Interfaces.1.Name: ed.c.val.ifaceDuplicate")
    expect(found).toContain("Devices.1.Name: ed.c.val.deviceNameDuplicate")
  })
})

describe("variables and gateways", () => {
  it("keeps a variable as a fixed value or a template through the wire", () => {
    const wire: NormalizedTopology = { Variables: [{ Name: "a", Value: "1" }, { Name: "b", Template: "[a-z]{4}" }], Devices: [], Connections: [], VisualRender: null }
    const form = topologyToForm(wire)
    expect(form.Variables).toEqual([{ Name: "a", Kind: "value", Text: "1" }, { Name: "b", Kind: "template", Text: "[a-z]{4}" }])
    expect(topologyToDTO(form).Variables).toEqual([{ Name: "a", Value: "1" }, { Name: "b", Template: "[a-z]{4}" }])
  })

  it("sends the reverse connections only for a VPN gateway and refuses them on an Internet gateway", () => {
    const vpn = { ...emptyGateway("vpn_gateway", "attack"), ID: "g1", ReverseConnections: true }
    const on = { ...emptyTopology(), Devices: [vpn] }
    expect(topologyToDTO(on).Devices?.[0]?.ReverseConnections).toBe(true)
    expect(messages(on)).toEqual([])
    const internet = { ...emptyGateway("internet_gateway", "out"), ID: "g2", ReverseConnections: true }
    const off = { ...emptyTopology(), Devices: [internet] }
    expect(messages(off)).toContain("Devices.0.ReverseConnections: ed.c.val.reverseNeedsVpn")
    expect(topologyToDTO(off).Devices?.[0]?.ReverseConnections).toBeUndefined()
  })

  it("reads a gateway device from the wire and sends it back with its own keys only", () => {
    const wire: NormalizedTopology = { ...topologyOnWire(), Devices: [normalizedDevice({ ID: "g1", Name: "attack", Type: "vpn_gateway", DHCP: true, DHCPRanges: [{ Start: 100, End: 200 }] })] }
    const form = topologyToForm(wire)
    expect(form.Devices[0]).toMatchObject({ Type: "vpn_gateway", DHCP: true, DHCPRanges: [{ Start: 100, End: 200 }] })
    expect(topologyToDTO(form).Devices?.[0]).toEqual({ ID: "g1", Name: "attack", Type: "vpn_gateway", DHCP: true, DHCPRanges: [{ Start: 100, End: 200 }] })
  })
})

function topologyOnWire(): NormalizedTopology {
  return { Variables: [], Devices: [], Connections: [], VisualRender: null }
}

describe("':' in names (the backend refuses it, error 23202)", () => {
  it("refuses ':' in a node name, a gateway name and a variable name at the field", () => {
    const withEnv = (name: string) => ({ ...emptyBootstrap(), Env: [{ Name: name, Value: "1", Secret: false, HasValue: false }] })
    const found = messages({ ...emptyTopology(), Devices: [
      device({ ID: "n", Name: "web:1", Bootstrap: withEnv("A:B") }),
      emptyGateway("vpn_gateway", "vpn:1"),
    ] })
    expect(found).toContain("Devices.0.Name: admin.ex.val.deviceName")
    expect(found).toContain("Devices.0.Bootstrap.Env.0.Name: ed.c.val.envName")
    expect(found).toContain("Devices.1.Name: admin.ex.val.deviceName")
  })
})
