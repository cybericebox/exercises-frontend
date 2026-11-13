import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, string | number>) => vars ? `${key} ${Object.values(vars).join(" ")}` : key }))

import { VariablesTable } from "./VariablesTable"
import { GatewayDialog } from "./GatewayDialog"
import { ActionsSlotContext } from "./ActionsSlot"
import { renameVarInText } from "./renameRefs"
import { useState } from "react"
import { capabilities, device, draftWith, FormHarness, gatewayDevice, readValues, Values } from "./test/harness"
import type { DeviceFormValues, VariableFormValues } from "@/lib/exerciseSchemas"

const variable = (Name: string, Text = "v", Kind: "value" | "template" = "value"): VariableFormValues => ({ Name, Kind, Text })

function renderVariables(variables: VariableFormValues[], options: { devices?: ReturnType<typeof device>[]; disabled?: boolean; onOpenUse?: () => void } = {}) {
  function Frame() {
    const [slot, setSlot] = useState<HTMLElement | null>(null)
    return <ActionsSlotContext.Provider value={slot}>
      <div ref={setSlot} data-testid="slot" />
      <VariablesTable variantIndex={0} disabled={options.disabled ?? false} onOpenUse={options.onOpenUse ?? (() => {})} />
      <Values path="Variants.0.Topology" />
    </ActionsSlotContext.Provider>
  }
  render(<FormHarness draft={draftWith(options.devices ?? [device()], { Variables: variables })} validate><Frame /></FormHarness>)
}

describe("variables of the schema", () => {
  it("shows a closed row as plain text with the value masked and an eye, and no inputs", () => {
    renderVariables([variable("secret_key", "hunter2")])
    expect(screen.getByText("secret_key")).toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    expect(screen.queryByText("hunter2")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "ed.ui.showValue" }))
    expect(screen.getByText("hunter2")).toBeInTheDocument()
  })

  it("puts the one add action into the shared slot and opens the new row for editing", () => {
    renderVariables([])
    expect(screen.getByText("ed.c.vars.empty")).toBeInTheDocument()
    fireEvent.click(within(screen.getByTestId("slot")).getByRole("button", { name: "ed.c.vars.add" }))
    expect(screen.getByRole("textbox", { name: "ed.c.vars.nameOf" })).toHaveValue("var1")
    expect(screen.getAllByRole("button", { name: "ed.c.vars.add" })).toHaveLength(1)
  })

  it("opens one row at a time, editable only when opened", () => {
    renderVariables([variable("a"), variable("b")])
    fireEvent.click(screen.getByRole("button", { name: /ed.ui.expand: a/ }))
    expect(screen.getAllByRole("textbox")).toHaveLength(1)
    fireEvent.click(screen.getByRole("button", { name: /ed.ui.expand: b/ }))
    expect(screen.getByRole("textbox", { name: "ed.c.vars.nameOf" })).toHaveValue("b")
    expect(screen.getAllByRole("textbox")).toHaveLength(1)
  })

  it("renames a variable and moves every reference to it, but only once the new name is valid", () => {
    const user = device({ ID: "d1", Name: "web", Bootstrap: { Timeout: "", Env: [{ Name: "PASS", Value: "{{var.old}}", Secret: false, HasValue: false }], Files: [], Script: "echo {{var.old}}", Interpreter: "" } })
    renderVariables([variable("old")], { devices: [user] })
    fireEvent.click(screen.getByRole("button", { name: /ed.ui.expand: old/ }))
    const name = screen.getByRole("textbox", { name: "ed.c.vars.nameOf" })
    fireEvent.change(name, { target: { value: "Bad Name" } })
    expect(name).toHaveAttribute("aria-invalid", "true")
    let topology = readValues() as { Variables: { Name: string }[]; Devices: { Bootstrap: { Env: { Value: string }[]; Script: string } }[] }
    expect(topology.Variables[0].Name).toBe("old")
    expect(topology.Devices[0].Bootstrap.Script).toBe("echo {{var.old}}")
    fireEvent.change(name, { target: { value: "fresh" } })
    topology = readValues() as typeof topology
    expect(topology.Variables[0].Name).toBe("fresh")
    expect(topology.Devices[0].Bootstrap.Env[0].Value).toBe("{{var.fresh}}")
    expect(topology.Devices[0].Bootstrap.Script).toBe("echo {{var.fresh}}")
  })

  it("lists where a variable is used as chips that open the exact place", () => {
    const onOpenUse = vi.fn()
    const user = device({ ID: "d1", Name: "web", Bootstrap: { Timeout: "", Env: [{ Name: "PASS", Value: "{{var.k}}", Secret: false, HasValue: false }], Files: [{ Path: "/etc/a", From: "text", Content: "{{var.k}}", Source: null, Owner: "", Group: "", Mode: "" }], Script: "", Interpreter: "" } })
    renderVariables([variable("k"), variable("unused")], { devices: [user], onOpenUse })
    const chips = screen.getAllByRole("button", { name: /ed.c.vars.openUse/ })
    expect(chips).toHaveLength(2)
    fireEvent.click(chips[0])
    expect(onOpenUse).toHaveBeenCalledWith(expect.objectContaining({ kind: "device", section: "service", field: ["Variants", "0", "Topology", "Devices", "0", "Bootstrap", "Env", "0", "Value"] }))
    fireEvent.click(chips[1])
    expect(onOpenUse).toHaveBeenLastCalledWith(expect.objectContaining({ section: "init" }))
    expect(screen.getByText("ed.c.vars.nowhere")).toBeInTheDocument()
  })

  it("switches a variable to a random pattern with a default pattern and back", () => {
    renderVariables([variable("k", "value")])
    fireEvent.click(screen.getByRole("button", { name: /ed.ui.expand: k/ }))
    fireEvent.keyDown(screen.getByRole("button", { name: "ed.c.vars.kind" }), { key: "ArrowDown" })
    fireEvent.click(screen.getByRole("menuitemradio", { name: /ed.c.vars.kindTemplate/ }))
    expect((readValues() as { Variables: VariableFormValues[] }).Variables[0]).toMatchObject({ Kind: "template", Text: "[a-z0-9]{16}" })
  })

  it("asks for confirmation before removing a variable and says it is used", async () => {
    const user = device({ Bootstrap: { Timeout: "", Env: [{ Name: "P", Value: "{{var.k}}", Secret: false, HasValue: false }], Files: [], Script: "", Interpreter: "" } })
    renderVariables([variable("k")], { devices: [user] })
    fireEvent.click(screen.getByRole("button", { name: "ed.c.vars.removeN k" }))
    const dialog = await screen.findByRole("dialog")
    expect(dialog).toHaveTextContent("ed.c.vars.removeUsed k 1")
    fireEvent.click(within(dialog).getByRole("button", { name: "ed.c.vars.remove" }))
    await waitFor(() => expect((readValues() as { Variables: unknown[] }).Variables).toHaveLength(0))
  })

  it("imports a .env file with corrected names and updates an existing variable after a confirmation", async () => {
    renderVariables([variable("mode", "old")])
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, "files", { value: [new File(["MODE=new\nDB_PASS=s3\n"], ".env")], configurable: true })
    fireEvent.change(input)
    const dialog = await screen.findByRole("dialog")
    expect(dialog).toHaveTextContent("ed.c.vars.importFixed")
    fireEvent.click(within(dialog).getByRole("button", { name: "ed.c.env.update" }))
    await waitFor(() => expect((readValues() as { Variables: VariableFormValues[] }).Variables.map((row) => [row.Name, row.Text])).toEqual([["mode", "new"], ["db_pass", "s3"]]))
  })

  it("shows the error of a duplicate name beside the closed row", async () => {
    renderVariables([variable("a"), variable("a")])
    fireEvent.click(screen.getByRole("button", { name: "validate-all" }))
    expect(await screen.findAllByText("ed.c.val.variableDuplicate")).not.toHaveLength(0)
  })

  it("has no add, no remove and no editing when read-only", () => {
    renderVariables([variable("a")], { disabled: true })
    expect(screen.queryByRole("button", { name: "ed.c.vars.add" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /ed.c.vars.removeN/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /ed.ui.expand: a/ }))
    expect(screen.getByRole("textbox", { name: "ed.c.vars.nameOf" })).toBeDisabled()
  })
})

describe("gateway dialogs", () => {
  const vpnDevice = () => gatewayDevice("vpn", "attack", "g1", { DHCP: false, DHCPRanges: [] })
  const internetDevice = () => gatewayDevice("internet", "out", "g2", { DHCP: false, DHCPRanges: [] })
  const indexOf = { vpn: 1, internet: 2 }
  function renderGateway(kind: "vpn" | "internet", options: { disabled?: boolean; caps?: ReturnType<typeof capabilities>; maxGateways?: number | null; extra?: DeviceFormValues[] } = {}) {
    render(<FormHarness draft={draftWith([device(), vpnDevice(), internetDevice(), ...(options.extra ?? [])])} caps={options.caps ?? null} maxGateways={options.maxGateways ?? null} validate>
      <GatewayDialog variantIndex={0} deviceIndex={indexOf[kind]} disabled={options.disabled ?? false} onClose={() => {}} />
      <Values path={`Variants.0.Topology.Devices.${indexOf[kind]}`} />
    </FormHarness>)
  }

  it("switches DHCP on with its ranges on the next line and a default range", () => {
    renderGateway("internet")
    expect(screen.queryByText("admin.exTopo.dhcp.ranges")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("switch", { name: "ed.c.gw.dhcp" }))
    expect(screen.getByText("admin.exTopo.dhcp.ranges")).toBeInTheDocument()
    expect(readValues()).toMatchObject({ DHCP: true, DHCPRanges: [{ Start: 2, End: 254 }] })
    fireEvent.change(screen.getByRole("textbox", { name: /ed.c.gw.dns/ }), { target: { value: "1.1.1.1" } })
    expect(readValues()).toMatchObject({ DNS: "1.1.1.1" })
  })

  it("starts with the name of the gateway, the first field of the dialog", () => {
    renderGateway("vpn")
    const name = screen.getByRole("textbox", { name: /ed.c.gw.name/ })
    expect(name).toHaveValue("attack")
    expect(document.querySelector("[data-gateway-dialog] input")).toBe(name)
  })

  it("renames the gateway with every reference to it, and keeps a bad name as a draft with its error beside the field", () => {
    const client = device({ ID: "d9", Name: "client", Interfaces: [{ Name: "eth0", MAC: "", IP: { Type: "static", Addresses: [], AddressRef: { Gateway: "attack", Host: 10 }, Gateway: "", GatewayRef: { Gateway: "attack", Host: 1 }, Routes: [{ Dst: "", DstRef: { Gateway: "attack" }, Via: "", ViaRef: { Gateway: "attack", Host: 1 } }] } }] })
    render(<FormHarness draft={draftWith([device(), vpnDevice(), internetDevice(), client])} validate>
      <GatewayDialog variantIndex={0} deviceIndex={1} disabled={false} onClose={() => {}} />
      <Values path="Variants.0.Topology.Devices" />
    </FormHarness>)
    const name = screen.getByRole("textbox", { name: /ed.c.gw.name/ })
    fireEvent.change(name, { target: { value: "Bad Name" } })
    expect(name).toHaveAttribute("aria-invalid", "true")
    expect((readValues() as { Name: string }[])[1].Name).toBe("attack")
    fireEvent.change(name, { target: { value: "out" } })
    expect(name).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByText("admin.ex.err.deviceNameDuplicate")).toBeInTheDocument()
    fireEvent.change(name, { target: { value: "lab-vpn" } })
    expect(name).not.toHaveAttribute("aria-invalid")
    const devices = readValues() as { Name: string; Interfaces: { IP: { AddressRef: unknown; GatewayRef: unknown; Routes: { DstRef: unknown; ViaRef: unknown }[] } }[] }[]
    expect(devices[1].Name).toBe("lab-vpn")
    expect(devices[3].Interfaces[0].IP).toMatchObject({ AddressRef: { Gateway: "lab-vpn", Host: 10 }, GatewayRef: { Gateway: "lab-vpn", Host: 1 }, Routes: [{ DstRef: { Gateway: "lab-vpn" }, ViaRef: { Gateway: "lab-vpn", Host: 1 } }] })
  })

  it("flags a surplus gateway beside its name when the platform limit is lower than the lab holds", () => {
    renderGateway("internet", { maxGateways: 1 })
    const name = screen.getByRole("textbox", { name: /ed.c.gw.name/ })
    expect(name).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByText("ed.c.val.gatewayLimit 1")).toBeInTheDocument()
  })

  it("has the reverse-connections switch only for the VPN gateway, off by default", () => {
    renderGateway("vpn")
    const reverse = screen.getByRole("switch", { name: "ed.c.gw.reverse" })
    expect(reverse).toHaveAttribute("aria-checked", "false")
    fireEvent.click(reverse)
    expect(readValues()).toMatchObject({ ReverseConnections: true })
  })

  it("does not offer reverse connections or a DNS field where they do not belong, and no warning about two DHCP servers", () => {
    renderGateway("internet")
    expect(screen.queryByRole("switch", { name: "ed.c.gw.reverse" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("switch", { name: "ed.c.gw.dhcp" }))
    expect(document.querySelector("[role=note]")).toBeNull()
  })

  it("disables reverse connections when no laboratory supports them, with the reason", () => {
    renderGateway("vpn", { caps: capabilities({ VPNReverse: "none" }) })
    expect(screen.getByRole("switch", { name: "ed.c.gw.reverse" })).toBeDisabled()
    expect(screen.getByText("ed.ui.lab.none")).toBeInTheDocument()
  })

  it("shows the range error beside the ranges", async () => {
    renderGateway("internet")
    fireEvent.click(screen.getByRole("switch", { name: "ed.c.gw.dhcp" }))
    fireEvent.change(screen.getByRole("spinbutton", { name: "admin.exTopo.dhcp.rangeStartN 1" }), { target: { value: "1" } })
    fireEvent.click(screen.getByRole("button", { name: "validate-all", hidden: true }))
    expect(await screen.findByText("admin.ex.val.dhcpRange")).toBeInTheDocument()
  })
})

describe("renaming references", () => {
  it("renames only whole references and keeps an escaped brace", () => {
    expect(renameVarInText("{{var.a}} {{var.ab}} \\{{var.a}}", "a", "z")).toBe("{{var.z}} {{var.ab}} \\{{var.a}}")
  })
})
