import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, string | number>) => vars ? `${key} ${Object.values(vars).join(" ")}` : key }))

const editor = vi.hoisted(() => ({ value: { variantIndex: 0, disabled: false, baseIndex: -1, resources: null as unknown, goTo: vi.fn(), goToField: vi.fn() } }))
vi.mock("../context", () => ({ useEditor: () => editor.value }))

import { InfraWorkspace } from "./InfraWorkspace"
import { ResourcesConfigProvider } from "../../ResourcesConfigContext"
import { RESOURCES_CONFIG } from "@/test/resourcesConfig"
import { emptyVariant } from "@/lib/exerciseSchemas"
import { device, draftWith, FormHarness, readValues, Values } from "./test/harness"

const web = () => device({ ID: "d1", Name: "web", Interfaces: [{ Name: "eth0", MAC: "", IP: { Type: "dhcp", Addresses: [], AddressRef: null, Gateway: "", GatewayRef: null, Routes: [] } }] })
const sw = () => device({ ID: "d2", Name: "sw1", Type: "unmanaged-switch", Interfaces: [] })

function renderWorkspace(options: { linked?: boolean } = {}) {
  const draft = draftWith([web(), sw()], {
    VPN: { Enabled: true, DHCP: false },
    Connections: [{ Endpoints: [{ Kind: "device", DeviceID: "d1", Interface: "eth0" }, { Kind: "device", DeviceID: "d2", Interface: "GigabitEthernet0/1" }] }],
    VisualRender: { positions: { d1: { x: 0.3, y: 0.3 }, d2: { x: 0.6, y: 0.3 }, vpn: { x: 0.8, y: 0.3 } } },
  })
  if (options.linked) {
    draft.Variants[0].LinkedTo = "base-variant"
    draft.Variants.push({ ...emptyVariant(2), ID: "base-variant" })
  }
  render(<ResourcesConfigProvider value={RESOURCES_CONFIG}><FormHarness draft={draft} validate>
    <InfraWorkspace /><Values path="Variants.0.Topology" />
  </FormHarness></ResourcesConfigProvider>)
}

beforeEach(() => { editor.value = { variantIndex: 0, disabled: false, baseIndex: -1, resources: null, goTo: vi.fn(), goToField: vi.fn() } })

const topology = () => readValues() as { Devices: { ID: string; Name: string }[]; Connections: unknown[]; VPN: { Enabled: boolean } }

describe("infrastructure workspace", () => {
  it("has the four sub-views in one row and marks the active one", () => {
    renderWorkspace()
    const nav = screen.getByRole("navigation", { name: "ed.c.views.aria" })
    expect(within(nav).getAllByRole("button").map((button) => button.textContent)).toEqual(["ed.c.views.diagram", "ed.c.views.devices", "ed.c.views.connections", "ed.c.views.vars"])
    expect(within(nav).getByRole("button", { name: "ed.c.views.diagram" })).toHaveAttribute("aria-current", "page")
    fireEvent.click(within(nav).getByRole("button", { name: "ed.c.views.devices" }))
    expect(within(nav).getByRole("button", { name: "ed.c.views.devices" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("table", { name: "ed.c.devices.title" })).toBeInTheDocument()
  })

  it("shows one read-only side panel for a node, with the settings and the trash pinned in its footer", () => {
    renderWorkspace()
    fireEvent.click(screen.getByTestId("node-d1"))
    const panel = document.querySelector<HTMLElement>("[data-side-panel]")!
    expect(within(panel).getByRole("heading", { name: "web" })).toBeInTheDocument()
    expect(within(panel).queryByRole("textbox")).not.toBeInTheDocument()
    expect(within(panel).getByText("ed.c.panel.interfaces")).toBeInTheDocument()
    expect(within(panel).getByRole("button", { name: "ed.c.panel.configure" })).toBeEnabled()
    expect(within(panel).getByRole("button", { name: "ed.c.panel.delete" })).toBeInTheDocument()
  })

  it("opens the device dialog on the section of the row that was clicked", () => {
    renderWorkspace()
    fireEvent.click(screen.getByTestId("node-d1"))
    fireEvent.click(screen.getByRole("button", { name: /ed.c.panel.interfaces/ }))
    const dialog = screen.getByRole("dialog")
    expect(dialog).toHaveTextContent("ed.c.dev.title web")
    expect(within(dialog).getByRole("button", { name: "ed.c.dev.network" })).toHaveAttribute("aria-current", "true")
    fireEvent.click(within(dialog).getByRole("button", { name: "ed.c.dev.access" }))
    expect(within(dialog).getByRole("switch", { name: "ed.c.access.web" })).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole("button", { name: "ed.c.dev.done" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("keeps «Налаштувати» of a switch disabled with its reason instead of dropping it", () => {
    renderWorkspace()
    fireEvent.click(screen.getByTestId("node-d2"))
    const settings = within(document.querySelector<HTMLElement>("[data-side-panel]")!).getByRole("button", { name: "ed.c.panel.configure" })
    expect(settings).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(settings)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("opens a small dialog for the VPN gateway", () => {
    renderWorkspace()
    fireEvent.click(screen.getByTestId("node-vpn"))
    fireEvent.click(within(document.querySelector<HTMLElement>("[data-side-panel]")!).getByRole("button", { name: "ed.c.panel.configure" }))
    expect(screen.getByRole("dialog")).toHaveTextContent("ed.c.gw.reverse")
  })

  it("removes a node only after the danger confirmation, with its connections", async () => {
    renderWorkspace()
    fireEvent.click(screen.getByTestId("node-d1"))
    fireEvent.click(within(document.querySelector<HTMLElement>("[data-side-panel]")!).getByRole("button", { name: "ed.c.panel.delete" }))
    const dialog = await screen.findByRole("dialog")
    expect(dialog).toHaveTextContent("ed.c.remove.withConnections 1")
    expect(topology().Devices).toHaveLength(2)
    fireEvent.click(within(dialog).getByRole("button", { name: "admin.exTopo.removeDevice" }))
    await waitFor(() => expect(topology().Devices.map((item) => item.Name)).toEqual(["sw1"]))
    expect(topology().Connections).toHaveLength(0)
  })

  it("adds a device from the single add menu and selects it", () => {
    renderWorkspace()
    fireEvent.keyDown(screen.getByRole("button", { name: "admin.exTopo.addDevice" }), { key: "ArrowDown" })
    fireEvent.click(screen.getByRole("menuitem", { name: "admin.exTopo.type.container" }))
    expect(topology().Devices.map((item) => item.Name)).toEqual(["web", "sw1", "host-1"])
    expect(document.querySelector("[data-side-panel]")).toHaveTextContent("host-1")
  })

  it("lists the devices with the gateway, and its row actions open the editor or remove", () => {
    renderWorkspace()
    fireEvent.click(screen.getByRole("button", { name: "ed.c.views.devices" }))
    const table = screen.getByRole("table", { name: "ed.c.devices.title" })
    expect(within(table).getAllByRole("row")).toHaveLength(4)
    fireEvent.click(within(table).getAllByRole("button", { name: "ed.c.panel.configure" })[0])
    expect(screen.getByRole("dialog")).toHaveTextContent("ed.c.dev.title web")
  })

  it("opens a connection's row in the connections table and removes it after a confirmation", async () => {
    renderWorkspace()
    fireEvent.click(screen.getByRole("button", { name: "ed.c.views.connections" }))
    fireEvent.click(screen.getByRole("button", { name: /admin.exTopo.overview.editConnectionN/ }))
    expect(screen.getByTestId("connection-editor-0")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.removeConnection" }))
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "admin.exTopo.removeConnection" }))
    await waitFor(() => expect(topology().Connections).toHaveLength(0))
  })

  it("disables «add connection» with a reason while fewer than two nodes have a free port", () => {
    const draft = draftWith([web()])
    render(<FormHarness draft={draft}><InfraWorkspace /></FormHarness>)
    expect(screen.getByRole("button", { name: "admin.exTopo.addConnection" })).toHaveAttribute("aria-disabled", "true")
  })
})

describe("read-only and linked variants", () => {
  it("offers no add and no delete when viewing, and the dialog opens to read", () => {
    editor.value = { ...editor.value, disabled: true }
    renderWorkspace()
    expect(screen.queryByRole("button", { name: "admin.exTopo.addDevice" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId("node-d1"))
    const panel = document.querySelector<HTMLElement>("[data-side-panel]")!
    expect(within(panel).getByRole("button", { name: "ed.c.panel.delete" })).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(within(panel).getByRole("button", { name: "ed.c.panel.view" }))
    expect(within(screen.getByRole("dialog")).getByRole("textbox", { name: /ed.c.main.name/ })).toBeDisabled()
  })

  it("in a linked variant says that only the image changes there and keeps the image editable", () => {
    renderWorkspace({ linked: true })
    expect(screen.getByText("ed.c.views.linkedNote 2")).toBeInTheDocument()
    fireEvent.click(screen.getByTestId("node-d1"))
    fireEvent.click(within(document.querySelector<HTMLElement>("[data-side-panel]")!).getByRole("button", { name: "ed.c.panel.view" }))
    const dialog = screen.getByRole("dialog")
    expect(dialog).toHaveTextContent("ed.c.dev.linkedNote 2")
    expect(within(dialog).getByRole("textbox", { name: /ed.c.main.name/ })).toBeDisabled()
    expect(within(dialog).getByPlaceholderText("admin.exTopo.imagePlaceholder")).toBeEnabled()
  })
})
