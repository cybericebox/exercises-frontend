import { describe, expect, it, vi } from "vitest"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))

import { countGatewayRefs, rewriteGatewayRefs } from "./gatewayRefs"
import { emptyDevice, emptyGateway } from "./schemas/infra"
import type { DraftFormValues } from "@/lib/exerciseSchemas"

type Devices = DraftFormValues["Variants"][number]["Topology"]["Devices"]
type Tasks = DraftFormValues["Variants"][number]["Tasks"]

const client = (): Devices[number] => ({ ...emptyDevice(), ID: "c", Name: "client", Interfaces: [
  { Name: "eth0", MAC: "", IP: { Type: "static", Addresses: [], AddressRef: { Gateway: "attack", Host: 10 }, Gateway: "", GatewayRef: { Gateway: "attack", Host: 1 }, Routes: [
    { Dst: "", DstRef: { Gateway: "out" }, Via: "", ViaRef: { Gateway: "attack", Host: 1 } },
    { Dst: "10.1.0.0/16", DstRef: null, Via: "10.0.0.1", ViaRef: null },
  ] } },
  { Name: "eth1", MAC: "", IP: { Type: "dhcp", Addresses: [], AddressRef: null, Gateway: "", GatewayRef: null, Routes: [] } },
] })
const gateways = (): Devices => [emptyGateway("vpn_gateway", "attack"), emptyGateway("internet_gateway", "out")]
const task = (gateway: string): Tasks[number] => ({ Placeholders: [{ Key: "p", Kind: "gateway.subnet", IPReference: "", Gateway: gateway }, { Key: "q", Kind: "gateway.subnet", IPReference: "", Gateway: "out" }] } as unknown as Tasks[number])

describe("references to a gateway by name", () => {
  it("counts addresses and gateways, routes and placeholders that name it", () => {
    expect(countGatewayRefs([client(), ...gateways()], [task("attack")], "attack")).toEqual({ addresses: 2, routes: 1, placeholders: 1 })
    expect(countGatewayRefs([client(), ...gateways()], [task("attack")], "out")).toEqual({ addresses: 0, routes: 1, placeholders: 1 })
    expect(countGatewayRefs([client()], [], "none")).toEqual({ addresses: 0, routes: 0, placeholders: 0 })
  })

  it("renames every reference, in interfaces, routes and placeholders, and leaves the others alone", () => {
    const original = client()
    const { devices, tasks } = rewriteGatewayRefs([original, ...gateways()], [task("attack")], "attack", "lab-vpn")
    const ip = devices[0].Interfaces[0].IP
    expect(ip.AddressRef).toEqual({ Gateway: "lab-vpn", Host: 10 })
    expect(ip.GatewayRef).toEqual({ Gateway: "lab-vpn", Host: 1 })
    expect(ip.Routes[0]).toMatchObject({ DstRef: { Gateway: "out" }, ViaRef: { Gateway: "lab-vpn", Host: 1 } })
    expect(ip.Routes[1]).toEqual(original.Interfaces[0].IP.Routes[1])
    expect(devices[0].Interfaces[1]).toBe(original.Interfaces[1])
    expect(devices[1]).toBe(devices[1])
    expect(tasks[0].Placeholders.map((placeholder) => placeholder.Gateway)).toEqual(["lab-vpn", "out"])
  })

  it("clears them on removal: the field goes back to «manual» and empty, a placeholder loses its gateway", () => {
    const { devices, tasks } = rewriteGatewayRefs([client()], [task("attack")], "attack", null)
    const ip = devices[0].Interfaces[0].IP
    expect(ip).toMatchObject({ AddressRef: null, Addresses: [""], GatewayRef: null, Gateway: "" })
    expect(ip.Routes[0]).toMatchObject({ DstRef: { Gateway: "out" }, ViaRef: null, Via: "" })
    expect(tasks[0].Placeholders.map((placeholder) => placeholder.Gateway)).toEqual(["", "out"])
  })

  it("returns the same objects when nothing names the gateway", () => {
    const devices = [client()]
    const tasks = [task("out")]
    const result = rewriteGatewayRefs(devices, tasks, "ghost", "x")
    expect(result.devices[0]).toBe(devices[0])
    expect(result.tasks[0]).toBe(tasks[0])
  })
})
