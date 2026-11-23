import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, string | number>) => vars ? `${key} ${Object.values(vars).join(" ")}` : key }))

import { PortsSection } from "./sections/PortsSection"
import { DefenseView } from "./DefenseView"
import { ConsoleCablesAvailableProvider } from "../consoleLines"
import { device, draftWith, FormHarness, readValues, Values } from "./test/harness"
import { emptyDefender } from "@/lib/editor/defender"
import type { DraftFormValues } from "@/lib/exerciseSchemas"

const eth0 = { Name: "eth0", MAC: "", IP: { Type: "dhcp" as const, Addresses: [], AddressRef: null, Gateway: "", GatewayRef: null, Routes: [] } }
const port = (Name: string) => ({ Name, Mode: "program", Command: [], User: "", Port: "" })
const cable = { Kind: "console", Endpoints: [{ Kind: "device" as const, DeviceID: "p", Interface: "serial0" }, { Kind: "device" as const, DeviceID: "r", Interface: "console0" }] }
const link = { Endpoints: [{ Kind: "device" as const, DeviceID: "p", Interface: "eth0" }, { Kind: "device" as const, DeviceID: "w", Interface: "eth0" }] }

function lab(): DraftFormValues {
  const draft = draftWith([
    device({ ID: "r", Name: "router", Interfaces: [eth0], ConsolePorts: [port("console0")] }),
    device({ ID: "p", Name: "pc", Interfaces: [eth0], SerialPorts: [{ Name: "serial0", Path: "" }] }),
    device({ ID: "w", Name: "web", Interfaces: [eth0] }),
  ], { Connections: [link, cable] })
  draft.Variants[0].Tasks[0].Key = "task_1"
  return draft
}
const variant = () => readValues() as DraftFormValues["Variants"][number]

function renderPorts(deviceIndex: number, draft = lab(), available: boolean | null = null) {
  render(<ConsoleCablesAvailableProvider value={available}><FormHarness draft={draft} validate>
    <PortsSection variantIndex={0} deviceIndex={deviceIndex} disabled={false} /><Values path="Variants.0" />
  </FormHarness></ConsoleCablesAvailableProvider>)
}

describe("the Ports section of the device dialog", () => {
  it("adds a console port with the first free name and the default program, and shows the defaults as placeholders", () => {
    renderPorts(0)
    fireEvent.click(screen.getByRole("button", { name: "ed.c.port.addConsole" }))
    expect(variant().Topology.Devices[0].ConsolePorts).toEqual([port("console0"), port("console1")])
    const row = screen.getByRole("group", { name: "ed.c.port.consoleN console1" })
    expect(within(row).getByLabelText(/ed.c.port.command/)).toHaveAttribute("placeholder", "/bin/login")
    expect(within(row).getByLabelText(/ed.c.port.user/)).toHaveAttribute("placeholder", "root")
    expect(screen.getByRole("group", { name: "ed.c.port.consoleN console0" })).toHaveTextContent("ed.c.port.cabledTo pc · serial0")
  })

  it("shows the serial device path (the default /dev/ttyCON<n>) and copies it", () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.assign(navigator, { clipboard: { writeText } })
    renderPorts(1)
    const row = screen.getByRole("group", { name: "ed.c.port.serialN serial0" })
    expect(within(row).getByLabelText(/ed.c.port.path/)).toHaveAttribute("placeholder", "/dev/ttyCON0")
    fireEvent.click(within(row).getByRole("button", { name: "ed.c.port.copyPath /dev/ttyCON0" }))
    expect(writeText).toHaveBeenCalledWith("/dev/ttyCON0")
  })

  it("renaming a port takes its cable along, once the field is left", () => {
    renderPorts(1)
    const input = within(screen.getByRole("group", { name: "ed.c.port.serialN serial0" })).getByLabelText(/ed.c.port.name/)
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: "serial4" } })
    expect(variant().Topology.Connections[1].Endpoints[0].Interface).toBe("serial0")
    fireEvent.blur(input)
    expect(variant().Topology.Connections[1].Endpoints[0].Interface).toBe("serial4")
  })

  it("removing a cabled port asks first and removes its cable with it", () => {
    renderPorts(0)
    fireEvent.click(screen.getByRole("button", { name: "ed.c.port.removeN console0" }))
    const dialog = screen.getByRole("dialog")
    expect(dialog).toHaveTextContent("ed.c.port.removeWithCable pc · serial0")
    fireEvent.click(within(dialog).getByRole("button", { name: "ed.c.port.remove" }))
    expect(variant().Topology.Devices[0].ConsolePorts).toEqual([])
    expect(variant().Topology.Connections).toEqual([link])
  })

  it("puts an error beside its field (aria-invalid, aria-describedby)", async () => {
    renderPorts(0)
    const input = within(screen.getByRole("group", { name: "ed.c.port.consoleN console0" })).getByLabelText(/ed.c.port.name/)
    fireEvent.change(input, { target: { value: "tty0" } })
    fireEvent.click(screen.getByRole("button", { name: "validate-all" }))
    const error = await screen.findByText("ed.c.port.val.consoleName")
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input.getAttribute("aria-describedby")).toContain(error.closest("p")!.id)
  })

  it("stops at the limit with the reason", () => {
    const draft = lab()
    draft.Variants[0].Topology.Devices[0].ConsolePorts = ["console0", "console1", "aux0", "aux1"].map(port)
    renderPorts(0, draft)
    expect(screen.getByRole("button", { name: "ed.c.port.addConsole" })).toHaveAttribute("aria-disabled", "true")
  })

  it("says that cables are designed but cannot be deployed yet when no laboratory serves them", () => {
    renderPorts(0, lab(), false)
    expect(screen.getByRole("note")).toHaveTextContent("ed.c.port.unavailable")
  })

  it("a Windows device gets no add buttons and says why", () => {
    const draft = lab()
    draft.Variants[0].Topology.Devices[2] = { ...draft.Variants[0].Topology.Devices[2], Profile: "vm", System: "windows" }
    renderPorts(2, draft)
    expect(screen.queryByRole("button", { name: "ed.c.port.addConsole" })).not.toBeInTheDocument()
    expect(screen.getByText("ed.c.port.windowsNote")).toBeInTheDocument()
  })
})

function renderDefense(draft = lab(), readOnly = false) {
  render(<FormHarness draft={draft} validate><DefenseView variantIndex={0} readOnly={readOnly} /><Values path="Variants.0" /></FormHarness>)
}

describe("the Defense view", () => {
  it("turns the defender block on and offers as the seat only nodes with serial ports", () => {
    renderDefense()
    fireEvent.click(screen.getByRole("switch", { name: "ed.c.def.enable" }))
    expect(variant().Defender).toEqual(emptyDefender())
    fireEvent.keyDown(screen.getByRole("button", { name: "ed.c.def.seat" }), { key: "Enter" })
    const items = screen.getAllByRole("menuitemradio").map((item) => item.textContent ?? "")
    expect(items).toHaveLength(2)
    expect(items[0].startsWith("ed.c.def.noSeat")).toBe(true)
    expect(items[1].startsWith("pc")).toBe(true)
    fireEvent.click(screen.getByRole("menuitemradio", { name: /^pc/ }))
    expect(variant().Defender?.Seat).toBe("pc")
  })

  it("the off-limits menu has checkboxes and cannot forbid a device cabled to the seat; empty is the default", () => {
    const draft = lab()
    draft.Variants[0].Defender = { ...emptyDefender(), Seat: "pc" }
    renderDefense(draft)
    expect(screen.getByText("ed.c.def.offLimitsHint")).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole("button", { name: "ed.c.def.offLimits" }), { key: "Enter" })
    const items = screen.getAllByRole("menuitemcheckbox")
    expect(items.map((item) => item.textContent)).toEqual(["routered.c.def.cabledToSeat", "web"])
    expect(items[0]).toHaveAttribute("data-disabled")
    fireEvent.click(items[1])
    expect(variant().Defender?.OffLimits).toEqual(["web"])
  })

  it("a stored secret credential shows «Value stored» and is replaced, never shown; the lock is fixed while it is stored", () => {
    const draft = lab()
    draft.Variants[0].Defender = { ...emptyDefender(), Credentials: [{ Device: "router", Port: "console0", User: "admin", Value: "", Secret: true, HasValue: true }] }
    renderDefense(draft)
    const row = screen.getByRole("group", { name: "ed.c.def.credentialN 1" })
    expect(row).toHaveTextContent("ed.c.env.stored")
    expect(within(row).getByRole("button", { name: "ed.c.def.secretN 1" })).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(within(row).getByRole("button", { name: "ed.c.env.replace" }))
    fireEvent.change(within(row).getByTestId("secret-value-input"), { target: { value: "n3w" } })
    expect(variant().Defender?.Credentials[0]).toMatchObject({ Value: "n3w", Secret: true })
  })

  it("a new credential is secret by default; the lock makes it plain", () => {
    renderDefense({ ...lab(), Variants: [{ ...lab().Variants[0], Defender: emptyDefender() }] })
    fireEvent.click(screen.getByRole("button", { name: "ed.c.def.addCredential" }))
    const row = screen.getByRole("group", { name: "ed.c.def.credentialN 1" })
    expect(within(row).getByRole("button", { name: "ed.c.def.secretN 1" })).toHaveAttribute("aria-pressed", "true")
    fireEvent.click(within(row).getByRole("button", { name: "ed.c.def.secretN 1" }))
    expect(variant().Defender?.Credentials[0].Secret).toBe(false)
  })

  it("turning off a block with content asks first (danger), then removes it", () => {
    const draft = lab()
    draft.Variants[0].Defender = { ...emptyDefender(), Seat: "pc" }
    renderDefense(draft)
    fireEvent.click(screen.getByRole("switch", { name: "ed.c.def.enable" }))
    const dialog = screen.getByRole("dialog")
    expect(variant().Defender?.Seat).toBe("pc")
    fireEvent.click(within(dialog).getByRole("button", { name: "ed.c.def.remove" }))
    expect(variant().Defender).toBeNull()
  })

  it("an opponent that operates devices picks its seat among valid devices; an attacker has none", () => {
    const draft = lab()
    draft.Variants[0].Opponents = [{ Role: "defense", Band: 2, Goal: ["task_1"], Operates: ["router"] }, { Role: "attack", Band: 1, Goal: ["task_1"] }]
    renderDefense(draft)
    const rows = document.querySelectorAll("[data-opponent-row]")
    expect(rows[1]).toHaveTextContent("ed.c.def.noSeatForRole")
    fireEvent.keyDown(within(rows[0] as HTMLElement).getByRole("button", { name: /ed.c.def.opponentSeat/ }), { key: "Enter" })
    fireEvent.click(screen.getByRole("menuitemradio", { name: /^pc/ }))
    expect(variant().Opponents?.[0]).toEqual({ Role: "defense", Band: 2, Goal: ["task_1"], Operates: ["router"], Seat: "pc" })
  })

  it("is read-only in a linked variant", () => {
    renderDefense(lab(), true)
    expect(screen.getByRole("switch", { name: "ed.c.def.enable" })).toBeDisabled()
  })
})
