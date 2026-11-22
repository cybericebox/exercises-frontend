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

function renderWorkspace() {
  const draft = draftWith([
    device({ ID: "r", Name: "router", Interfaces: [eth0], ConsolePorts: [{ Name: "console0" }] }),
    device({ ID: "p", Name: "pc", Interfaces: [eth0], SerialPorts: [{ Name: "serial0" }] }),
  ], { Connections: [network, cable], VisualRender: { positions: { r: { x: 0.3, y: 0.3 }, p: { x: 0.6, y: 0.3 } } } })
  draft.Variants[0].Tasks[0].Key = "task_1"
  draft.Variants[0].Opponents = opponents
  render(<ResourcesConfigProvider value={RESOURCES_CONFIG}><FormHarness draft={draft} validate>
    <InfraWorkspace /><Values path="Variants.0" />
  </FormHarness></ResourcesConfigProvider>)
}

const variant = () => readValues() as { Opponents?: OpponentDTO[]; Topology: { Devices: { Name: string }[]; Connections: { Kind?: string }[] } }

beforeEach(() => { editor.value = { variantIndex: 0, disabled: false, baseIndex: -1, resources: null, goTo: vi.fn(), goToField: vi.fn() } })

describe("console cables and opponents in the infrastructure editor", () => {
  it("shows a console cable as a read-only row: no editor, no removal, with its note", () => {
    renderWorkspace()
    fireEvent.click(screen.getByRole("button", { name: "ed.c.views.connections" }))
    const row = screen.getByTestId("connection-row-1")
    expect(row).toHaveAttribute("data-console", "true")
    expect(within(row).queryByRole("button", { name: /admin.exTopo.overview.editConnectionN/ })).not.toBeInTheDocument()
    fireEvent.click(row)
    expect(screen.queryByTestId("connection-editor-1")).not.toBeInTheDocument()
    expect(screen.getByTestId("connection-console-1")).toHaveTextContent("ed.c.console.readOnly")
    // The network link keeps its editor.
    fireEvent.click(screen.getByTestId("connection-row-0"))
    expect(screen.getByTestId("connection-editor-0")).toBeInTheDocument()
    expect(variant().Topology.Connections.map((connection) => connection.Kind ?? "")).toEqual(["", "console"])
  })

  it("the schema offers no removal of a console cable (menu, Delete key, side panel)", () => {
    renderWorkspace()
    const edges = screen.getAllByRole("button", { name: "router — pc" }).concat(screen.queryAllByRole("button", { name: "pc — router" }))
    const consoleEdge = edges.find((edge) => edge.querySelector("[data-edge='e1']"))!
    fireEvent.contextMenu(consoleEdge)
    expect(screen.queryByRole("menuitem", { name: "admin.exTopo.removeConnection" })).not.toBeInTheDocument()
    fireEvent.keyDown(consoleEdge, { key: "Escape" })
    fireEvent.keyDown(consoleEdge, { key: "Delete" })
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    fireEvent.click(consoleEdge)
    const panel = document.querySelector<HTMLElement>("[data-side-panel]")!
    const trash = within(panel).getByRole("button", { name: "ed.c.panel.delete" })
    expect(trash).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(trash)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(variant().Topology.Connections).toHaveLength(2)
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
