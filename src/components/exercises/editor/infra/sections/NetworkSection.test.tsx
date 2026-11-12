import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, string | number>) => vars ? `${key} ${Object.values(vars).join(" ")}` : key }))

import { NetworkSection } from "./NetworkSection"
import { device, draftWith, FormHarness, readValues, Values } from "../test/harness"
import type { DeviceFormValues } from "@/lib/exerciseSchemas"

const iface = (name: string, ip: Partial<DeviceFormValues["Interfaces"][number]["IP"]> = {}) => ({
  Name: name, MAC: "", IP: { Type: "dhcp" as const, Addresses: [], AddressRef: null, Gateway: "", GatewayRef: null, Routes: [], ...ip },
})

function renderNetwork(interfaces: DeviceFormValues["Interfaces"], options: { disabled?: boolean; connected?: boolean; path?: string; validate?: boolean } = {}) {
  const peer = device({ ID: "d2", Name: "db", Interfaces: [iface("eth0")] })
  const draft = draftWith([device({ Interfaces: interfaces }), peer], options.connected ? {
    Connections: [{ Endpoints: [{ Kind: "device", DeviceID: "d1", Interface: interfaces[0].Name }, { Kind: "device", DeviceID: "d2", Interface: "eth0" }] }],
  } : {})
  render(<FormHarness draft={draft} validate={options.validate}>
    <NetworkSection variantIndex={0} deviceIndex={0} disabled={options.disabled ?? false} />
    <Values path={options.path ?? "Variants.0.Topology.Devices.0.Interfaces"} />
  </FormHarness>)
}

describe("interfaces", () => {
  it("shows a closed row as a plain text summary: name, mode in words, connection; no inputs", () => {
    renderNetwork([iface("eth0", { Type: "static", Addresses: ["10.0.0.2/24"], Gateway: "10.0.0.1" }), iface("eth1")], { connected: true })
    const rows = document.querySelectorAll("[data-expandable-row]")
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent("eth0")
    expect(rows[0]).toHaveTextContent("ed.c.net.staticAddress 10.0.0.2/24")
    expect(rows[0]).toHaveTextContent("10.0.0.1")
    expect(rows[0]).toHaveTextContent("ed.c.net.linkedTo db · eth0")
    expect(rows[1]).toHaveTextContent("ed.c.net.notLinked")
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })

  it("opens one row at a time and shows the name, the mode and the MAC last", () => {
    renderNetwork([iface("eth0"), iface("eth1")])
    fireEvent.click(screen.getByRole("button", { name: /ed.ui.expand: eth0/ }))
    expect(screen.getByRole("textbox", { name: /ed.c.net.ifaceName/ })).toHaveValue("eth0")
    const form = document.querySelector("[data-interface-form]")!
    const labels = [...form.querySelectorAll("label")].map((label) => label.textContent)
    expect(labels[labels.length - 1]).toContain("ed.c.net.mac")
    fireEvent.click(screen.getByRole("button", { name: /ed.ui.expand: eth1/ }))
    expect(document.querySelectorAll("[data-interface-form]")).toHaveLength(1)
    expect(screen.getByRole("textbox", { name: /ed.c.net.ifaceName/ })).toHaveValue("eth1")
  })

  it("renames an interface at once and moves its connections with it", () => {
    renderNetwork([iface("eth0")], { connected: true, path: "Variants.0.Topology" })
    fireEvent.click(screen.getByRole("button", { name: /ed.ui.expand: eth0/ }))
    fireEvent.change(screen.getByRole("textbox", { name: /ed.c.net.ifaceName/ }), { target: { value: "uplink" } })
    const topology = readValues() as { Devices: { Interfaces: { Name: string }[] }[]; Connections: { Endpoints: { Interface: string }[] }[] }
    expect(topology.Devices[0].Interfaces[0].Name).toBe("uplink")
    expect(topology.Connections[0].Endpoints[0].Interface).toBe("uplink")
  })

  it("keeps an invalid name as a draft with its error beside the field and does not touch the form", () => {
    renderNetwork([iface("eth0"), iface("eth1")])
    fireEvent.click(screen.getByRole("button", { name: /ed.ui.expand: eth0/ }))
    const name = screen.getByRole("textbox", { name: /ed.c.net.ifaceName/ })
    fireEvent.change(name, { target: { value: "eth1" } })
    expect(name).toHaveAttribute("aria-invalid", "true")
    expect(document.getElementById(name.getAttribute("aria-describedby")!)).toHaveTextContent("ed.c.val.ifaceDuplicate")
    fireEvent.change(name, { target: { value: "a".repeat(16) } })
    expect(screen.getByText("ed.c.val.ifaceLength")).toBeInTheDocument()
    expect((readValues() as { Name: string }[])[0].Name).toBe("eth0")
  })

  it("offers the four addressing modes with an explanation each, and a static mode with its address, gateway and routes", () => {
    renderNetwork([iface("eth0")])
    fireEvent.click(screen.getByRole("button", { name: /ed.ui.expand: eth0/ }))
    fireEvent.keyDown(screen.getByRole("button", { name: /ed.c.net.mode/ }), { key: "ArrowDown" })
    const options = screen.getAllByRole("menuitemradio")
    expect(options).toHaveLength(4)
    expect(options[0]).toHaveTextContent("admin.exTopo.ip.staticHelp")
    fireEvent.click(options[0])
    expect(screen.getByRole("textbox", { name: /admin.exTopo.addresses|ed.c.net.addr/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.addRoute" }))
    expect(screen.getByRole("group", { name: /admin.exTopo.routeItemN/ })).toBeInTheDocument()
  })

  it("restores the static address after switching to DHCP and back", () => {
    renderNetwork([iface("eth0", { Type: "static", Addresses: ["10.0.0.5/24"] })])
    fireEvent.click(screen.getByRole("button", { name: /ed.ui.expand: eth0/ }))
    const choose = (index: number) => {
      fireEvent.keyDown(screen.getByRole("button", { name: /ed.c.net.mode/ }), { key: "ArrowDown" })
      fireEvent.click(screen.getAllByRole("menuitemradio")[index])
    }
    choose(1)
    expect(screen.queryByDisplayValue("10.0.0.5/24")).not.toBeInTheDocument()
    choose(0)
    expect(screen.getByDisplayValue("10.0.0.5/24")).toBeInTheDocument()
  })

  it("adds the next free ethN and opens it", () => {
    renderNetwork([iface("eth0"), iface("eth2")])
    fireEvent.click(screen.getByRole("button", { name: "ed.c.net.add" }))
    expect((readValues() as { Name: string }[]).map((row) => row.Name)).toEqual(["eth0", "eth2", "eth1"])
    expect(screen.getByRole("textbox", { name: /ed.c.net.ifaceName/ })).toHaveValue("eth1")
  })

  it("removes an interface only after the danger confirmation, and not one that is connected", async () => {
    renderNetwork([iface("eth0"), iface("eth1")], { connected: true })
    const rows = document.querySelectorAll<HTMLElement>("[data-expandable-row]")
    expect(within(rows[0]).queryByRole("button", { name: "admin.exTopo.removeInterface" })).not.toBeInTheDocument()
    fireEvent.click(within(rows[1]).getByRole("button", { name: "admin.exTopo.removeInterface" }))
    expect((readValues() as unknown[]).length).toBe(2)
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "ed.c.net.remove" }))
    await waitFor(() => expect((readValues() as unknown[]).length).toBe(1))
  })

  it("puts address errors beside the address and each route error beside its own control", async () => {
    renderNetwork([iface("eth0", { Type: "static", Addresses: ["bad"], Routes: [{ Dst: "bad", Via: "bad" }] })], { validate: true })
    fireEvent.click(screen.getByRole("button", { name: "validate-all" }))
    await waitFor(() => expect(screen.getByRole("textbox", { name: /ed.c.net.ifaceName/ })).toBeInTheDocument())
    for (const name of [/admin.exTopo.addresses/, /admin.exTopo.routeDst/, /admin.exTopo.routeVia/]) {
      const control = await screen.findByRole("textbox", { name })
      await waitFor(() => expect(control).toHaveAttribute("aria-invalid", "true"))
    }
  })

  it("is read-only when disabled: no add, no remove, name disabled", () => {
    renderNetwork([iface("eth0")], { disabled: true })
    expect(screen.queryByRole("button", { name: "ed.c.net.add" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /ed.ui.expand: eth0/ }))
    expect(screen.getByRole("textbox", { name: /ed.c.net.ifaceName/ })).toBeDisabled()
  })
})
