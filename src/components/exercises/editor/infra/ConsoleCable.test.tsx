import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, string | number>) => vars ? `${key} ${Object.values(vars).join(" ")}` : key }))

const editor = vi.hoisted(() => ({ value: { variantIndex: 0, disabled: false, baseIndex: -1, resources: null as unknown, goTo: vi.fn(), goToField: vi.fn() } }))
vi.mock("../context", () => ({ useEditor: () => editor.value }))

import { InfraWorkspace } from "./InfraWorkspace"
import { ResourcesConfigProvider } from "../../ResourcesConfigContext"
import { RESOURCES_CONFIG } from "@/test/resourcesConfig"
import type { OpponentDTO } from "@/api/exercises/versions"
import { device, draftWith, FormHarness, readValues, Values } from "./test/harness"

const eth0 = { Name: "eth0", MAC: "", IP: { Type: "dhcp" as const, Addresses: [], AddressRef: null, Gateway: "", GatewayRef: null, Routes: [] } }
const network = { Endpoints: [{ Kind: "device" as const, DeviceID: "r", Interface: "eth0" }, { Kind: "device" as const, DeviceID: "p", Interface: "eth0" }] }
const cable = { Kind: "console", Endpoints: [{ Kind: "device" as const, DeviceID: "p", Interface: "serial0" }, { Kind: "device" as const, DeviceID: "r", Interface: "console0" }] }
const opponents: OpponentDTO[] = [{ Role: "defense", Band: 2, Goal: ["task_1"], Operates: ["router"], Seat: "pc" }]

function renderWorkspace(connections: unknown[] = [network, cable]) {
  const draft = draftWith([
    device({ ID: "r", Name: "router", Interfaces: [eth0], ConsolePorts: [{ Name: "console0", Mode: "program", Command: [], User: "", Port: "" }, { Name: "aux0", Mode: "program", Command: [], User: "", Port: "" }] }),
    device({ ID: "p", Name: "pc", Interfaces: [eth0], SerialPorts: [{ Name: "serial0", Path: "" }, { Name: "serial1", Path: "" }] }),
    device({ ID: "w", Name: "web", Interfaces: [eth0] }),
  ], { Connections: connections as never, VisualRender: { positions: { r: { x: 0.3, y: 0.3 }, p: { x: 0.6, y: 0.3 }, w: { x: 0.45, y: 0.7 } } } })
  draft.Variants[0].Tasks[0].Key = "task_1"
  draft.Variants[0].Opponents = opponents
  render(<ResourcesConfigProvider value={RESOURCES_CONFIG}><FormHarness draft={draft} validate>
    <InfraWorkspace /><Values path="Variants.0" />
  </FormHarness></ResourcesConfigProvider>)
}

const variant = () => readValues() as { Opponents?: OpponentDTO[]; Topology: { Devices: { Name: string }[]; Connections: { Kind?: string }[] } }

beforeEach(() => { editor.value = { variantIndex: 0, disabled: false, baseIndex: -1, resources: null, goTo: vi.fn(), goToField: vi.fn() } })

describe("console cables and opponents in the infrastructure editor", () => {
  it("lists a console cable with its type and edits its ends with serial and console ports only", () => {
    renderWorkspace()
    fireEvent.click(screen.getByRole("button", { name: "ed.c.views.connections" }))
    const row = screen.getByTestId("connection-row-1")
    expect(row).toHaveAttribute("data-console", "true")
    expect(row.querySelector("[data-connection-kind]")).toHaveAttribute("data-connection-kind", "console")
    expect(row).toHaveTextContent("ed.c.th.kindConsole")
    expect(screen.getByTestId("connection-row-0")).toHaveTextContent("ed.c.th.kindNetwork")
    fireEvent.click(within(row).getByRole("button", { name: /admin.exTopo.overview.editConnectionN/ }))
    const editor = screen.getByTestId("connection-editor-1")
    // The first end (pc · serial0): another serial port of pc, never a NIC or a console port of the same device.
    fireEvent.keyDown(within(editor).getByRole("button", { name: "admin.exTopo.endpoint.first" }), { key: "Enter" })
    const first = screen.getAllByRole("menuitemradio").map((item) => item.textContent)
    expect(first.some((text) => text?.includes("pc · serial1"))).toBe(true)
    expect(first.some((text) => text?.includes("eth0"))).toBe(false)
    expect(first.some((text) => text?.includes("router"))).toBe(false)
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    expect(editor).toHaveTextContent("ed.c.cable.outsideNetworks")
    expect(variant().Topology.Connections.map((connection) => connection.Kind ?? "")).toEqual(["", "console"])
  })

  it("a console cable is removed like any connection (the schema's menu and a confirmation)", () => {
    renderWorkspace()
    const consoleEdge = document.querySelector<HTMLElement>("[data-edge-kind='console']")!
    expect(consoleEdge.querySelector("[data-edge='e1']")).toHaveAttribute("stroke-dasharray", "7 4")
    fireEvent.contextMenu(consoleEdge)
    fireEvent.click(screen.getByRole("menuitem", { name: "admin.exTopo.removeConnection" }))
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "admin.exTopo.removeConnection" }))
    expect(variant().Topology.Connections.map((connection) => connection.Kind ?? "")).toEqual([""])
  })

  it("the console connect mode joins a serial port to a console port and never offers a device without free ports", () => {
    renderWorkspace([network])
    fireEvent.keyDown(screen.getByRole("button", { name: /ed.c.add.menu/ }), { key: "ArrowDown" })
    fireEvent.click(screen.getByRole("menuitem", { name: /ed.c.cable.addShort/ }))
    expect(document.querySelector(".topology-connect-hint")).toHaveTextContent("ed.c.cable.selectFirst")
    // web has no ports: picking it does nothing.
    fireEvent.click(screen.getByTestId("node-w"))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId("node-p"))
    fireEvent.click(screen.getByTestId("node-r"))
    const dialog = screen.getByRole("dialog")
    expect(dialog).toHaveTextContent("ed.c.cable.outsideNetworks")
    fireEvent.click(within(dialog).getByRole("button", { name: "ed.c.cable.add" }))
    expect(variant().Topology.Connections[1]).toEqual({ Kind: "console", Endpoints: [{ Kind: "device", DeviceID: "p", Interface: "serial0" }, { Kind: "device", DeviceID: "r", Interface: "console0" }] })
  })

  it("a port takes one cable: with every console port of the router cabled, no second cable starts there", () => {
    const second = { Kind: "console", Endpoints: [{ Kind: "device" as const, DeviceID: "p", Interface: "serial1" }, { Kind: "device" as const, DeviceID: "r", Interface: "aux0" }] }
    renderWorkspace([network, cable, second])
    fireEvent.keyDown(screen.getByRole("button", { name: /ed.c.add.menu/ }), { key: "ArrowDown" })
    expect(screen.getByRole("menuitem", { name: /ed.c.cable.addShort/ })).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByText("ed.c.cable.needPorts")).toHaveAttribute("role", "note")
  })

  it("the form refuses a cable with both ends on one device beside its second end", async () => {
    const wrong = { Kind: "console", Endpoints: [{ Kind: "device" as const, DeviceID: "p", Interface: "serial0" }, { Kind: "device" as const, DeviceID: "p", Interface: "serial1" }] }
    renderWorkspace([network, wrong])
    fireEvent.click(screen.getByRole("button", { name: "ed.c.views.connections" }))
    fireEvent.click(screen.getByRole("button", { name: "validate-all" }))
    expect(await screen.findByText("ed.c.port.val.cable.same_device")).toBeInTheDocument()
  })

  function nameInput(id: string) {
    fireEvent.click(screen.getByTestId(`node-${id}`))
    fireEvent.click(within(document.querySelector<HTMLElement>("[data-side-panel]")!).getByRole("button", { name: "ed.c.panel.configure" }))
    const input = within(screen.getByRole("dialog")).getByLabelText(/ed.c.main.name/)
    fireEvent.focus(input)
    return input
  }

  it("renaming a device in its dialog carries the new name into the opponents once, when the field is left", () => {
    renderWorkspace()
    const input = nameInput("p")
    fireEvent.change(input, { target: { value: "des" } })
    fireEvent.change(input, { target: { value: "desk" } })
    expect(variant().Opponents?.[0].Seat).toBe("pc") // not per keystroke
    fireEvent.blur(input)
    expect(variant().Opponents?.[0].Seat).toBe("desk")
    expect(variant().Opponents?.[0].Operates).toEqual(["router"])
  })

  it("clearing the name on the way keeps the references: they follow the final name", () => {
    renderWorkspace()
    const input = nameInput("p")
    fireEvent.change(input, { target: { value: "" } })
    fireEvent.change(input, { target: { value: "desk" } })
    fireEvent.blur(input)
    expect(variant().Opponents?.[0].Seat).toBe("desk")
  })

  it("an empty name left in the field moves nothing", () => {
    renderWorkspace()
    const input = nameInput("p")
    fireEvent.change(input, { target: { value: "" } })
    fireEvent.blur(input)
    expect(variant().Opponents?.[0].Seat).toBe("pc")
  })

  it("typing through another device's name does not move its references", () => {
    renderWorkspace()
    const input = nameInput("p")
    fireEvent.change(input, { target: { value: "router" } })
    fireEvent.change(input, { target: { value: "router2" } })
    fireEvent.blur(input)
    expect(variant().Opponents?.[0]).toMatchObject({ Seat: "router2", Operates: ["router"] })
  })

  it("leaving the field on another device's name moves nothing (the field shows its duplicate error)", () => {
    renderWorkspace()
    const input = nameInput("p")
    fireEvent.change(input, { target: { value: "router" } })
    fireEvent.blur(input)
    expect(variant().Opponents?.[0]).toMatchObject({ Seat: "pc", Operates: ["router"] })
  })

  it("after leaving the field empty, a later edit still renames from the original name", () => {
    renderWorkspace()
    const input = nameInput("p")
    fireEvent.change(input, { target: { value: "" } })
    fireEvent.blur(input)
    expect(variant().Opponents?.[0].Seat).toBe("pc")
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: "desk" } })
    fireEvent.blur(input)
    expect(variant().Opponents?.[0].Seat).toBe("desk")
  })

  it("after leaving the field on a taken name, fixing it renames from the original name", () => {
    renderWorkspace()
    const input = nameInput("p")
    fireEvent.change(input, { target: { value: "router" } })
    fireEvent.blur(input)
    expect(variant().Opponents?.[0]).toMatchObject({ Seat: "pc", Operates: ["router"] })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: "router2" } })
    fireEvent.blur(input)
    expect(variant().Opponents?.[0]).toMatchObject({ Seat: "router2", Operates: ["router"] })
  })

  it("closing the dialog while typing commits the rename", () => {
    renderWorkspace()
    const input = nameInput("p")
    fireEvent.change(input, { target: { value: "desk" } })
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "ed.c.dev.done" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(variant().Opponents?.[0].Seat).toBe("desk")
  })

  it("the removal of a device the opponents name says so in the confirmation", () => {
    renderWorkspace()
    fireEvent.click(screen.getByTestId("node-r"))
    fireEvent.click(within(document.querySelector<HTMLElement>("[data-side-panel]")!).getByRole("button", { name: "ed.c.panel.delete" }))
    expect(screen.getByRole("dialog")).toHaveTextContent("ed.c.remove.opponents 1")
  })
})
