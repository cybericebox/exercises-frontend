import { describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { FormProvider, useForm, useFormContext, useWatch } from "react-hook-form"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))

import { TopologySection } from "./TopologySection"
import { emptyDraft, type DraftFormValues } from "@/lib/exerciseSchemas"

function Snapshot() {
  const { control } = useFormContext<DraftFormValues>()
  const topology = useWatch({ control, name: "Variants.0.Topology" })
  return <output data-testid="topology-snapshot">{JSON.stringify(topology)}</output>
}

function Harness({ disabled = false, draft }: { disabled?: boolean; draft?: DraftFormValues } = {}) {
  const form = useForm<DraftFormValues>({ defaultValues: draft ?? emptyDraft() })
  return <FormProvider {...form}><TopologySection variantIndex={0} disabled={disabled} /><Snapshot /></FormProvider>
}

function connectHostAndSwitch() {
  addNode("container")
  addNode("switch")
  fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.addConnection" }))
  fireEvent.click(within(diagram()).getByRole("button", { name: "host-1" }))
  fireEvent.click(within(diagram()).getByRole("button", { name: "sw-1" }))
  fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.canvasConnect" }))
}

function topology() {
  return JSON.parse(screen.getByTestId("topology-snapshot").textContent ?? "{}") as DraftFormValues["Variants"][number]["Topology"]
}

function addNode(name: "container" | "switch" | "hub" | "vpn" | "internet") {
  fireEvent.keyDown(screen.getByRole("button", { name: "admin.exTopo.addDevice" }), { key: "ArrowDown" })
  fireEvent.click(screen.getByRole("menuitem", { name: name === "vpn" || name === "internet" ? `admin.exTopo.${name}` : `admin.exTopo.type.${name}` }))
}

function diagram() {
  return screen.getByRole("group", { name: "admin.exTopo.diagram" })
}

describe("topology workspace", () => {
  it("expands the canvas to the viewport and restores the editor layout", () => {
    render(<Harness />)
    const workspace = screen.getByTestId("topology-workspace")
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.expandCanvas" }))
    expect(workspace).toHaveClass("fixed")
    expect(workspace).toHaveClass("inset-0")
    expect(workspace).toHaveClass("p-0")
    expect(screen.getByTestId("topology-canvas-surface")).not.toHaveClass("border", "rounded-md")
    expect(diagram()).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.collapseCanvas" }))
    expect(workspace).not.toHaveClass("fixed")
    expect(diagram()).toBeInTheDocument()
  })

  it("saves a dragged node label separately from its icon position", () => {
    render(<Harness />)
    addNode("container")
    const nodeId = topology().Devices[0].ID
    const svg = diagram()
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 960, height: 560 } as DOMRect)
    const label = within(svg).getByText("host-1", { selector: "text" })
    const x = Number(label.getAttribute("x"))
    const y = Number(label.getAttribute("y"))
    fireEvent(label, new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: x, clientY: y }))
    fireEvent(svg, new MouseEvent("pointermove", { bubbles: true, clientX: x + 30, clientY: y - 12 }))
    fireEvent(svg, new MouseEvent("pointerup", { bubbles: true, clientX: x + 30, clientY: y - 12 }))
    const visual = topology().VisualRender as { labelOffsets?: Record<string, unknown>; positions?: Record<string, unknown> } | null
    expect(visual?.labelOffsets).toHaveProperty(nodeId)
    expect(visual?.positions?.[nodeId]).toBeUndefined()
  })

  it("marks the active tab at rest and explains only that tab", () => {
    render(<Harness />)
    const tab = (name: string) => screen.getByRole("button", { name })
    expect(tab("admin.exTopo.diagram")).toHaveAttribute("aria-current", "page")
    expect(tab("admin.exTopo.diagram")).toHaveClass("bg-card", "text-foreground")
    expect(tab("admin.exTopo.devices")).not.toHaveClass("bg-card")
    expect(screen.getByRole("button", { name: "ui.help" })).toHaveAccessibleDescription("admin.exTopo.tabHelp.diagram.what admin.exTopo.tabHelp.diagram.connect")
    fireEvent.click(tab("admin.exTopo.connections"))
    expect(tab("admin.exTopo.connections")).toHaveClass("bg-card")
    expect(screen.getByRole("button", { name: "ui.help" })).toHaveAccessibleDescription("admin.exTopo.tabHelp.connections.what admin.exTopo.tabHelp.connections.gateway")
    expect(screen.queryByRole("heading", { name: "admin.exTopo.connections" })).not.toBeInTheDocument()
    expect(tab("admin.exTopo.connections").querySelector("button")).toBeNull()
  })

  it("uses separate diagram, device and connection screens", () => {
    render(<Harness />)
    expect(diagram()).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.devices" }))
    expect(screen.queryByRole("group", { name: "admin.exTopo.diagram" })).not.toBeInTheDocument()
    // Empty panels show the shared EmptyState centered in the panel; the device table keeps its header.
    const noDevices = screen.getByText("admin.exTopo.noDevices").closest("[data-empty-state]")
    expect(noDevices?.parentElement).toHaveClass("items-center", "justify-center")
    expect(screen.getByRole("columnheader", { name: "admin.exTopo.overview.device" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.connections" }))
    expect(screen.getByText("admin.exTopo.noConnections").closest("[data-empty-state]")?.parentElement).toHaveClass("flex-1", "items-center", "justify-center")
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.diagram" }))
    expect(diagram()).toBeInTheDocument()
  })

  it("creates a typed device immediately, then opens the one canvas inspector from the list", () => {
    render(<Harness />)
    addNode("container")
    expect(topology().Devices[0].Name).toBe("host-1")
    expect(topology().Devices[0].Type).toBe("container")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.devices" }))
    expect(screen.getByRole("table", { name: "admin.exTopo.devices" })).toBeInTheDocument()
    expect(screen.getByRole("columnheader", { name: "admin.exTopo.overview.ports" })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText("web-01")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "host-1" }))
    expect(diagram()).toBeInTheDocument()
    expect(screen.getByRole("complementary", { name: "admin.exTopo.deviceSettings" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.basic" }))
    expect(screen.getByRole("button", { name: "admin.exTopo.renameDevice: host-1" })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText("web-01")).not.toBeInTheDocument()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("shows the matching node pictograms in the add-device menu", () => {
    render(<Harness />)
    fireEvent.keyDown(screen.getByRole("button", { name: "admin.exTopo.addDevice" }), { key: "ArrowDown" })
    const icons = [
      ["admin.exTopo.type.container", "host"],
      ["admin.exTopo.type.switch", "switch"],
      ["admin.exTopo.type.hub", "hub"],
      ["admin.exTopo.vpn", "vpn"],
      ["admin.exTopo.internet", "internet"],
    ] as const
    for (const [label, icon] of icons) {
      expect(screen.getByRole("menuitem", { name: label }).querySelector(`[data-topology-glyph="${icon}"]`)).toBeInTheDocument()
    }
  })

  it("keeps toolbar-created devices in distinct positions after the first three rows", () => {
    render(<Harness />)
    for (let index = 0; index < 13; index++) addNode("container")
    const points = Array.from(diagram().querySelectorAll('[data-icon-hitbox]')).map((rect) =>
      `${rect.getAttribute("x")},${rect.getAttribute("y")}`)
    expect(points).toHaveLength(13)
    expect(new Set(points).size).toBe(13)
  })

  it("adds nodes from the empty-canvas menu and starts a connection from the source node menu", () => {
    render(<Harness />)
    fireEvent.contextMenu(diagram(), { clientX: 280, clientY: 190 })
    fireEvent.click(screen.getByRole("menuitem", { name: "admin.exTopo.type.container" }))
    fireEvent.contextMenu(diagram(), { clientX: 600, clientY: 300 })
    fireEvent.click(screen.getByRole("menuitem", { name: "admin.exTopo.type.switch" }))
    expect(topology().Devices).toHaveLength(2)
    expect(topology().VisualRender?.positions).toHaveProperty(topology().Devices[0].ID)
    expect(screen.queryByRole("button", { name: "admin.exTopo.configure" })).not.toBeInTheDocument()
    fireEvent.contextMenu(within(diagram()).getByRole("button", { name: "host-1" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "admin.exTopo.addConnection" }))
    fireEvent.click(within(diagram()).getByRole("button", { name: "sw-1" }))
    expect(screen.getByRole("dialog", { name: "admin.exTopo.canvasConnect" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.canvasConnect" }))
    expect(topology().Connections).toHaveLength(1)
  })

  it("connects two containers from the canvas using each device's eth0", () => {
    render(<Harness />)
    addNode("container")
    addNode("container")
    fireEvent.contextMenu(within(diagram()).getByRole("button", { name: "host-1" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "admin.exTopo.addConnection" }))
    fireEvent.click(within(diagram()).getByRole("button", { name: "host-2" }))
    expect(topology().Connections).toHaveLength(0)
    const modal = screen.getByRole("dialog", { name: "admin.exTopo.canvasConnect" })
    expect(within(modal).getAllByText(/eth0/).length).toBeGreaterThanOrEqual(2)
    fireEvent.click(within(modal).getByRole("button", { name: "admin.exTopo.canvasConnect" }))
    expect(topology().Connections).toHaveLength(1)
    expect(topology().Connections[0].Endpoints).toEqual([
      { Kind: "device", DeviceID: topology().Devices[0].ID, Interface: "eth0" },
      { Kind: "device", DeviceID: topology().Devices[1].ID, Interface: "eth0" },
    ])
    expect(diagram().querySelector('[data-edge="e0"]')).toBeInTheDocument()
  })

  it("keeps the 48-port switch picker inside a compact scrollable menu", () => {
    render(<Harness />)
    addNode("container")
    addNode("switch")
    fireEvent.contextMenu(within(diagram()).getByRole("button", { name: "host-1" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "admin.exTopo.addConnection" }))
    fireEvent.click(within(diagram()).getByRole("button", { name: "sw-1" }))
    const modal = screen.getByRole("dialog", { name: "admin.exTopo.canvasConnect" })
    expect(modal).toHaveClass("max-w-md")
    fireEvent.keyDown(within(modal).getByRole("button", { name: "admin.exTopo.endpoint.second" }), { key: "ArrowDown" })
    const picker = screen.getByRole("menu")
    expect(picker).toHaveClass("overflow-y-auto")
    expect(picker).toHaveClass("max-h-60")
    expect(within(picker).getAllByRole("menuitemradio")).toHaveLength(48)
  })

  it("keeps the connection dialog open while a port is chosen from its dropdown", () => {
    render(<Harness />)
    addNode("container")
    addNode("switch")
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.addConnection" }))
    fireEvent.click(within(diagram()).getByRole("button", { name: "host-1" }))
    fireEvent.click(within(diagram()).getByRole("button", { name: "sw-1" }))
    const modal = screen.getByRole("dialog", { name: "admin.exTopo.canvasConnect" })
    fireEvent.keyDown(within(modal).getByRole("button", { name: "admin.exTopo.endpoint.second" }), { key: "ArrowDown" })
    const option = screen.getByRole("menuitemradio", { name: "Gi0/2" })
    expect(modal.contains(option)).toBe(true)
    fireEvent.keyDown(option, { key: "Escape" })
    expect(screen.getByRole("dialog", { name: "admin.exTopo.canvasConnect" })).toBe(modal)
    fireEvent.keyDown(within(modal).getByRole("button", { name: "admin.exTopo.endpoint.second" }), { key: "ArrowDown" })
    const reopened = screen.getByRole("menuitemradio", { name: "Gi0/2" })
    fireEvent.pointerDown(reopened)
    fireEvent.click(reopened)
    expect(screen.getByRole("dialog", { name: "admin.exTopo.canvasConnect" })).toBe(modal)
    expect(within(modal).getByRole("button", { name: "admin.exTopo.endpoint.second" })).toHaveTextContent("Gi0/2")
    expect(topology().Connections).toHaveLength(0)
  })

  it("closes only the port dropdown when its trigger is clicked again", () => {
    render(<Harness />)
    addNode("container")
    addNode("switch")
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.addConnection" }))
    fireEvent.click(within(diagram()).getByRole("button", { name: "host-1" }))
    fireEvent.click(within(diagram()).getByRole("button", { name: "sw-1" }))
    const modal = screen.getByRole("dialog", { name: "admin.exTopo.canvasConnect" })
    for (const endpoint of ["first", "second"]) {
      const trigger = within(modal).getByRole("button", { name: `admin.exTopo.endpoint.${endpoint}` })
      fireEvent(trigger, new MouseEvent("pointerdown", { bubbles: true, button: 0, ctrlKey: false }))
      expect(screen.getByRole("menu")).toBeInTheDocument()
      fireEvent(trigger, new MouseEvent("pointerdown", { bubbles: true, button: 0, ctrlKey: false }))
      fireEvent.pointerUp(trigger)
      fireEvent.click(trigger)
      expect(screen.queryByRole("menu")).not.toBeInTheDocument()
      expect(screen.getByRole("dialog", { name: "admin.exTopo.canvasConnect" })).toBe(modal)
    }
    expect(topology().Connections).toHaveLength(0)
  })

  it("closes the connection dialog on an outside pointer press", () => {
    render(<Harness />)
    addNode("container")
    addNode("switch")
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.addConnection" }))
    fireEvent.click(within(diagram()).getByRole("button", { name: "host-1" }))
    fireEvent.click(within(diagram()).getByRole("button", { name: "sw-1" }))
    const modal = screen.getByRole("dialog", { name: "admin.exTopo.canvasConnect" })
    fireEvent(within(modal).getByRole("button", { name: "admin.exTopo.endpoint.second" }),
      new MouseEvent("pointerdown", { bubbles: true, button: 0, ctrlKey: false }))
    expect(screen.getByRole("menu")).toBeInTheDocument()
    const overlay = modal.previousElementSibling
    expect(overlay).toBeInTheDocument()
    fireEvent.pointerDown(overlay!)
    expect(screen.queryByRole("dialog", { name: "admin.exTopo.canvasConnect" })).not.toBeInTheDocument()
    expect(topology().Connections).toHaveLength(0)
  })

  it("opens configuration from the menu, then swaps the open inspector on a normal device click", () => {
    render(<Harness />)
    addNode("container")
    addNode("container")
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.devices" }))
    expect(screen.getByRole("row", { name: /host-2/ })).toHaveAttribute("aria-selected", "true")
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.diagram" }))
    expect(diagram()).toBeInTheDocument()
    const host = within(diagram()).getByRole("button", { name: "host-1" })
    fireEvent.click(host)
    expect(screen.queryByRole("complementary", { name: "admin.exTopo.deviceSettings" })).not.toBeInTheDocument()
    fireEvent.keyDown(host, { key: "F10", shiftKey: true })
    fireEvent.click(screen.getByRole("menuitem", { name: "admin.exTopo.configure" }))
    expect(screen.getByRole("complementary", { name: "admin.exTopo.deviceSettings" })).toBeInTheDocument()
    const panel = screen.getByRole("complementary", { name: "admin.exTopo.deviceSettings" })
    fireEvent.click(within(diagram()).getByRole("button", { name: "host-2" }))
    expect(screen.getByRole("complementary", { name: "admin.exTopo.deviceSettings" })).toBe(panel)
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.basic" }))
    expect(screen.getByRole("button", { name: "admin.exTopo.renameDevice: host-2" })).toBeInTheDocument()
    expect(screen.getByTestId("topology-canvas-layout")).toHaveClass("xl:flex-row")
    expect(screen.getByTestId("topology-canvas-layout")).toContainElement(diagram())
    expect(screen.queryByRole("button", { name: "admin.exTopo.icon.firewall" })).not.toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole("button", { name: "admin.exTopo.icon.change" }), { key: "ArrowDown" })
    fireEvent.click(screen.getByRole("menuitem", { name: "admin.exTopo.icon.firewall" }))
    expect(topology().VisualRender?.icons).toEqual({ [topology().Devices[1].ID]: "firewall" })
    expect(screen.queryByRole("menuitem", { name: "admin.exTopo.icon.firewall" })).not.toBeInTheDocument()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.getByRole("complementary", { name: "admin.exTopo.deviceSettings" })).toBeInTheDocument()
    fireEvent.click(diagram().querySelector('[data-canvas-background]')!)
    expect(screen.getByRole("complementary", { name: "admin.exTopo.deviceSettings" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.closeSettings" }))
    expect(screen.queryByRole("complementary", { name: "admin.exTopo.deviceSettings" })).not.toBeInTheDocument()
  })

  it("renames a device from the inspector heading while a single diagram click stays out of edit mode", async () => {
    render(<Harness />)
    addNode("container")
    fireEvent.contextMenu(within(diagram()).getByRole("button", { name: "host-1" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "admin.exTopo.configure" }))
    const rename = screen.getByRole("button", { name: "admin.exTopo.renameDevice: host-1" })
    expect(rename.querySelector("svg")).toHaveClass("opacity-0", "group-hover:opacity-100", "group-focus-visible:opacity-100")
    fireEvent.mouseEnter(rename.parentElement!)
    expect(screen.getByRole("tooltip")).toHaveTextContent("admin.exTopo.renameDevice")
    fireEvent.click(rename)
    const name = screen.getByRole("textbox", { name: "admin.exTopo.deviceName" })
    fireEvent.change(name, { target: { value: "web-01" } })
    await act(async () => { fireEvent.keyDown(name, { key: "Enter" }) })
    expect(topology().Devices[0].Name).toBe("web-01")
    expect(within(diagram()).getByText("web-01", { selector: "text" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.closeSettings" }))
    fireEvent.click(within(diagram()).getByText("web-01", { selector: "text" }))
    expect(screen.queryByRole("textbox", { name: "admin.exTopo.deviceName" })).not.toBeInTheDocument()
  })

  it("limits a container name to 35 characters with an inline error and a help hint", async () => {
    render(<Harness />)
    addNode("container")
    fireEvent.contextMenu(within(diagram()).getByRole("button", { name: "host-1" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "admin.exTopo.configure" }))
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.renameDevice: host-1" }))
    const name = screen.getByRole("textbox", { name: "admin.exTopo.deviceName" })
    expect(name).toHaveAttribute("maxlength", "35")
    expect(screen.getAllByRole("button", { name: "ui.help" }).some((button) => document.getElementById(button.getAttribute("aria-describedby") ?? "")?.textContent === "admin.exTopo.deviceNameHelp")).toBe(true)
    fireEvent.change(name, { target: { value: "Web_1" } })
    await act(async () => { fireEvent.keyDown(name, { key: "Enter" }) })
    expect(screen.getByRole("alert")).toHaveTextContent("admin.ex.val.deviceName")
    expect(topology().Devices[0].Name).toBe("host-1")
    fireEvent.change(name, { target: { value: "a".repeat(35) } })
    await act(async () => { fireEvent.keyDown(name, { key: "Enter" }) })
    expect(topology().Devices[0].Name).toBe("a".repeat(35))
  })

  it("renames a label in place without opening the inspector, while a glyph double click still opens it", async () => {
    render(<Harness />)
    addNode("container")
    const label = within(diagram()).getByText("host-1", { selector: "text" })
    fireEvent.doubleClick(label)
    const input = screen.getByRole("textbox", { name: "admin.exTopo.deviceName" }) as HTMLInputElement
    expect(input.value).toBe("host-1")
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(input.value.length)
    expect(screen.queryByRole("complementary", { name: "admin.exTopo.deviceSettings" })).not.toBeInTheDocument()
    fireEvent.change(input, { target: { value: "web-02" } })
    await act(async () => { fireEvent.keyDown(input, { key: "Enter" }) })
    expect(topology().Devices[0].Name).toBe("web-02")
    expect(screen.queryByRole("textbox", { name: "admin.exTopo.deviceName" })).not.toBeInTheDocument()
    fireEvent.doubleClick(within(diagram()).getByTestId(`node-${topology().Devices[0].ID}`).querySelector("[data-icon-hitbox]")!)
    expect(screen.getByRole("complementary", { name: "admin.exTopo.deviceSettings" })).toBeInTheDocument()
  })

  it("keeps the current inspector while a different node label enters inline rename", () => {
    render(<Harness />)
    addNode("container")
    addNode("container")
    const svg = diagram()
    const first = within(svg).getByTestId(`node-${topology().Devices[0].ID}`)
    fireEvent.doubleClick(first.querySelector("[data-icon-hitbox]")!)
    expect(screen.getByRole("button", { name: "admin.exTopo.renameDevice: host-1" })).toBeInTheDocument()
    const secondLabel = within(svg).getByText("host-2", { selector: "text" })
    fireEvent.click(secondLabel)
    fireEvent.doubleClick(secondLabel)
    expect(screen.getByRole("button", { name: "admin.exTopo.renameDevice: host-1" })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "admin.exTopo.deviceName" })).toHaveValue("host-2")
  })

  it("keeps container DNS validation and accepts free gateway and forwarding names", async () => {
    render(<Harness />)
    addNode("container")
    fireEvent.doubleClick(within(diagram()).getByText("host-1", { selector: "text" }))
    const containerName = screen.getByRole("textbox", { name: "admin.exTopo.deviceName" })
    fireEvent.change(containerName, { target: { value: "My Host" } })
    await act(async () => { fireEvent.keyDown(containerName, { key: "Enter" }) })
    expect(screen.getByRole("alert")).toHaveTextContent("admin.ex.val.deviceName")
    expect(topology().Devices[0].Name).toBe("host-1")
    fireEvent.keyDown(containerName, { key: "Escape" })

    addNode("switch")
    fireEvent.doubleClick(within(diagram()).getByText("sw-1", { selector: "text" }))
    const switchName = screen.getByRole("textbox", { name: "admin.exTopo.deviceName" })
    fireEvent.change(switchName, { target: { value: "Комутатор А" } })
    await act(async () => { fireEvent.keyDown(switchName, { key: "Enter" }) })
    expect(topology().Devices[1].Name).toBe("Комутатор А")

    addNode("vpn")
    fireEvent.doubleClick(within(diagram()).getByText("admin.exTopo.vpn", { selector: "text" }))
    const gatewayName = screen.getByRole("textbox", { name: "admin.exTopo.deviceName" })
    fireEvent.change(gatewayName, { target: { value: "VPN шлюз" } })
    await act(async () => { fireEvent.keyDown(gatewayName, { key: "Enter" }) })
    expect(topology().VisualRender?.gatewayLabels).toEqual({ vpn: "VPN шлюз" })
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("opens configuration on a double click and does not toggle it closed on a third click", () => {
    render(<Harness />)
    addNode("container")
    const host = within(diagram()).getByRole("button", { name: "host-1" })
    fireEvent.click(host)
    expect(screen.queryByRole("complementary", { name: "admin.exTopo.deviceSettings" })).not.toBeInTheDocument()
    fireEvent.doubleClick(host)
    const panel = screen.getByRole("complementary", { name: "admin.exTopo.deviceSettings" })
    fireEvent.click(host)
    expect(screen.getByRole("complementary", { name: "admin.exTopo.deviceSettings" })).toBe(panel)
  })

  it("resizes the canvas inspector and restores its width from this browser", () => {
    const storageKey = "cib_topology_inspector_width"
    const values = new Map([[storageKey, "400"]])
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    })
    try {
      render(<Harness />)
      addNode("container")
      fireEvent.contextMenu(within(diagram()).getByRole("button", { name: "host-1" }))
      fireEvent.click(screen.getByRole("menuitem", { name: "admin.exTopo.configure" }))
      const panel = screen.getByRole("complementary", { name: "admin.exTopo.deviceSettings" })
      const divider = screen.getByRole("separator", { name: "admin.exTopo.resizeSettings" })
      expect(within(divider).getByTestId("topology-inspector-resize-grip")).toBeInTheDocument()
      expect(panel).toHaveClass("xl:ml-2", "xl:border")
      expect(divider).toHaveClass("top-1/2", "h-16")
      expect(within(divider).queryByTestId("topology-inspector-divider-line")).not.toBeInTheDocument()
      expect(divider).toHaveAttribute("aria-valuemin", "352")
      expect(divider).toHaveAttribute("aria-valuenow", "400")
      expect(panel.style.getPropertyValue("--topology-inspector-width")).toBe("400px")
      expect(panel).toHaveClass("xl:min-w-[22rem]")

      fireEvent.keyDown(divider, { key: "ArrowLeft" })
      expect(divider).toHaveAttribute("aria-valuenow", "424")
      expect(window.localStorage.getItem(storageKey)).toBe("424")

      vi.spyOn(screen.getByTestId("topology-canvas-layout"), "getBoundingClientRect")
        .mockReturnValue({ right: 1200, width: 1200 } as DOMRect)
      const capture = vi.fn()
      divider.setPointerCapture = capture
      const pointer = (type: string, clientX: number) => {
        const event = new MouseEvent(type, { bubbles: true, button: 0, clientX })
        Object.defineProperty(event, "pointerId", { value: 3 })
        fireEvent(divider, event)
      }
      pointer("pointerdown", 776)
      pointer("pointermove", 650)
      pointer("pointerup", 650)
      expect(capture).toHaveBeenCalledWith(3)
      expect(divider).toHaveAttribute("aria-valuenow", "550")
      expect(window.localStorage.getItem(storageKey)).toBe("550")
      fireEvent.keyDown(divider, { key: "Home" })
      expect(divider).toHaveAttribute("aria-valuenow", "352")
      expect(window.localStorage.getItem(storageKey)).toBe("352")
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("creates one VPN node and exposes only DHCP in its configuration", () => {
    render(<Harness />)
    addNode("vpn")
    expect(topology().VPN.Enabled).toBe(true)
    fireEvent.contextMenu(within(diagram()).getByRole("button", { name: "admin.exTopo.vpn" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "admin.exTopo.configure" }))
    const panel = screen.getByRole("complementary", { name: "admin.exTopo.deviceSettings" })
    expect(within(panel).getByText("admin.exTopo.networkDescription.vpn.purpose")).toBeInTheDocument()
    expect(within(panel).getByText("admin.exTopo.networkDescription.vpn.ports")).toBeInTheDocument()
    expect(within(panel).queryByText("admin.exTopo.networkDescription.vpn.speed")).not.toBeInTheDocument()
    expect(within(panel).getByRole("button", { name: "admin.exTopo.renameDevice: admin.exTopo.vpn" })).toBeInTheDocument()
    expect(within(panel).queryByRole("button", { name: "admin.exTopo.icon.change" })).not.toBeInTheDocument()
    expect(panel).toHaveClass("xl:min-w-[22rem]")
    expect(within(panel).getByRole("switch", { name: "admin.exTopo.vpnDhcp" })).toBeInTheDocument()
    expect(within(panel).queryByRole("switch", { name: "admin.exTopo.vpn" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.closeSettings" }))
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.devices" }))
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.vpn" }))
    expect(screen.getByRole("switch", { name: "admin.exTopo.vpnDhcp" })).toBeInTheDocument()
    expect(diagram()).toBeInTheDocument()
    expect(screen.getByRole("complementary", { name: "admin.exTopo.deviceSettings" })).toBeInTheDocument()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it.each([
    ["switch", "sw-1", "switch"],
    ["hub", "hub-1", "hub"],
    ["internet", "admin.exTopo.internet", "internet"],
  ] as const)("explains the %s network node in the shared device configuration panel", (kind, name, description) => {
    render(<Harness />)
    addNode(kind)
    fireEvent.contextMenu(within(diagram()).getByRole("button", { name }))
    fireEvent.click(screen.getByRole("menuitem", { name: "admin.exTopo.configure" }))
    const panel = screen.getByRole("complementary", { name: "admin.exTopo.deviceSettings" })
    expect(within(panel).getByRole("heading", { name: "admin.exTopo.deviceSettings" })).toBeInTheDocument()
    expect(within(panel).getByText(`admin.exTopo.networkDescription.${description}.purpose`)).toBeInTheDocument()
    if (kind === "switch" || kind === "hub") {
      const purpose = within(panel).getByText(`admin.exTopo.networkDescription.${description}.purpose`)
      const behavior = within(panel).getByText(`admin.exTopo.networkDescription.${description}.behavior`)
      expect(purpose.tagName).toBe("P")
      expect(behavior.tagName).toBe("P")
      expect(behavior.parentElement).toBe(purpose.parentElement)
    }
    expect(within(panel).getByText(`admin.exTopo.networkDescription.${description}.ports`)).toBeInTheDocument()
    expect(within(panel).queryByText(`admin.exTopo.networkDescription.${description}.speed`)).not.toBeInTheDocument()
    expect(within(panel).queryByText("admin.exTopo.networkFact.speed")).not.toBeInTheDocument()
    expect(within(panel).getByRole("button", { name: `admin.exTopo.renameDevice: ${name}` })).toBeInTheDocument()
    expect(within(panel).queryByRole("button", { name: "admin.exTopo.icon.change" })).not.toBeInTheDocument()
    if (kind === "internet") expect(within(panel).getByRole("switch", { name: "admin.exTopo.internetDhcp" })).toBeInTheDocument()
  })

  it("renames fixed gateway labels in the inspector and keeps them across canvas and lists", async () => {
    render(<Harness />)
    addNode("vpn")
    addNode("internet")
    fireEvent.contextMenu(within(diagram()).getByRole("button", { name: "admin.exTopo.vpn" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "admin.exTopo.configure" }))
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.renameDevice: admin.exTopo.vpn" }))
    const name = screen.getByRole("textbox", { name: "admin.exTopo.deviceName" })
    fireEvent.change(name, { target: { value: "VPN шлюз" } })
    await act(async () => { fireEvent.keyDown(name, { key: "Enter" }) })
    expect(topology().VisualRender?.gatewayLabels).toEqual({ vpn: "VPN шлюз" })
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(within(diagram()).getByRole("button", { name: "VPN шлюз" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.devices" }))
    expect(screen.getByRole("button", { name: "VPN шлюз" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "VPN шлюз" }))
    expect(screen.getByRole("button", { name: "admin.exTopo.renameDevice: VPN шлюз" })).toBeInTheDocument()
  })

  it("connects two nodes only after confirmation and selects the edge on both screens", () => {
    render(<Harness />)
    addNode("container")
    addNode("switch")
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.addConnection" }))
    fireEvent.click(within(diagram()).getByRole("button", { name: "host-1" }))
    fireEvent.click(within(diagram()).getByRole("button", { name: "sw-1" }))
    expect(topology().Connections).toHaveLength(0)
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.canvasConnect" }))
    expect(topology().Connections).toHaveLength(1)
    expect(topology().Connections[0].Endpoints[1].Interface).toBe("GigabitEthernet0/1")
    fireEvent.click(diagram().querySelector('[data-edge="e0"]')!)
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.connections" }))
    expect(screen.getByTestId("connection-row-0")).toHaveClass("bg-accent")
    expect(screen.getByRole("table", { name: "admin.exTopo.connections" })).toBeInTheDocument()
    fireEvent.click(within(screen.getByTestId("connection-row-0")).getByRole("button", { name: "admin.exTopo.overview.showOnDiagram" }))
    expect(diagram().querySelector('[data-edge="e0"]')).toHaveClass("stroke-primary")
  })

  it("persists a dragged port caption through the topology form", () => {
    render(<Harness />)
    addNode("container")
    addNode("switch")
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.addConnection" }))
    fireEvent.click(within(diagram()).getByRole("button", { name: "host-1" }))
    fireEvent.click(within(diagram()).getByRole("button", { name: "sw-1" }))
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.canvasConnect" }))
    const svg = diagram()
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 960, height: 560 } as DOMRect)
    const caption = svg.querySelector('[data-port-label]')!
    const key = caption.getAttribute("data-port-label-key")!
    const initialX = Number(caption.getAttribute("x"))
    fireEvent(caption, new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 200, clientY: 200 }))
    fireEvent(svg, new MouseEvent("pointermove", { bubbles: true, clientX: 230, clientY: 200 }))
    fireEvent(svg, new MouseEvent("pointerup", { bubbles: true, clientX: 230, clientY: 200 }))
    const offset = (topology().VisualRender?.portLabelOffsets as Record<string, { x: number; y: number }>)[key]
    expect(Math.hypot(offset.x, offset.y)).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.devices" }))
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.diagram" }))
    expect(Number(diagram().querySelector('[data-port-label]')!.getAttribute("x"))).toBeGreaterThan(initialX)
  })

  it("marks occupied nodes unavailable before choosing a connection pair", () => {
    render(<Harness />)
    addNode("vpn")
    addNode("container")
    addNode("container")
    addNode("switch")
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.addConnection" }))
    fireEvent.click(within(diagram()).getByRole("button", { name: "admin.exTopo.vpn" }))
    fireEvent.click(within(diagram()).getByRole("button", { name: "host-1" }))
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.canvasConnect" }))

    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.addConnection" }))
    const vpn = within(diagram()).getByRole("button", { name: "admin.exTopo.vpn" })
    expect(vpn).toHaveAttribute("aria-disabled", "true")
    expect(vpn).toHaveAttribute("aria-description", "admin.exTopo.noFreePort")
    fireEvent.click(vpn)
    fireEvent.click(within(diagram()).getByRole("button", { name: "host-2" }))
    expect(screen.queryByRole("dialog", { name: "admin.exTopo.canvasConnect" })).not.toBeInTheDocument()
    fireEvent.contextMenu(vpn)
    expect(screen.getByRole("menuitem", { name: "admin.exTopo.addConnection" })).toHaveAttribute("aria-disabled", "true")
  })

  it("cascades linked VPN connections only after confirmed removal", async () => {
    render(<Harness />)
    addNode("vpn")
    addNode("container")
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.addConnection" }))
    fireEvent.click(within(diagram()).getByRole("button", { name: "admin.exTopo.vpn" }))
    fireEvent.click(within(diagram()).getByRole("button", { name: "host-1" }))
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.canvasConnect" }))
    expect(topology().Connections[0].Endpoints[0].Interface).toBe("eth0")
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.devices" }))
    fireEvent.click(within(screen.getByRole("row", { name: /admin.exTopo.vpn/ })).getByRole("button", { name: "admin.exTopo.removeDevice" }))
    expect(topology().Connections).toHaveLength(1)
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog", { name: "admin.exTopo.removeDeviceTitle" })).getByRole("button", { name: "admin.exTopo.removeDevice" }))
    })
    expect(topology().VPN.Enabled).toBe(false)
    expect(topology().Connections).toHaveLength(0)
  })

  it("disables «add connection» with a reason until two devices exist", () => {
    render(<Harness />)
    const add = () => screen.getByRole("button", { name: "admin.exTopo.addConnection" })
    expect(add()).toHaveAttribute("aria-disabled", "true")
    expect(add()).toHaveAccessibleDescription("admin.exTopo.needTwoDevices")
    fireEvent.pointerEnter(add().parentElement!)
    expect(screen.getByRole("tooltip")).toHaveTextContent("admin.exTopo.needTwoDevices")
    fireEvent.click(add())
    expect(screen.queryByText("admin.exTopo.canvasSelectFirst")).not.toBeInTheDocument()
    addNode("container")
    expect(add()).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.connections" }))
    expect(screen.getByRole("button", { name: "admin.exTopo.addConnection" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.diagram" }))
    addNode("switch")
    expect(add()).not.toHaveAttribute("aria-disabled")
    expect(add()).toBeEnabled()
  })

  it("opens a connection's settings in the connections tab from the canvas menu", () => {
    render(<Harness />)
    connectHostAndSwitch()
    fireEvent.contextMenu(diagram().querySelector('[data-edge="e0"]')!)
    fireEvent.click(screen.getByRole("menuitem", { name: "admin.exTopo.configure" }))
    expect(screen.getByRole("button", { name: "admin.exTopo.connections" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByTestId("connection-editor-0")).toBeInTheDocument()
    expect(screen.getByTestId("connection-row-0")).toHaveClass("bg-accent")
  })

  it("deletes a connection from the canvas menu only after the danger confirmation", async () => {
    render(<Harness />)
    connectHostAndSwitch()
    fireEvent.contextMenu(diagram().querySelector('[data-edge="e0"]')!)
    fireEvent.click(screen.getByRole("menuitem", { name: "admin.exTopo.removeConnection" }))
    const dialog = screen.getByRole("dialog", { name: "admin.exTopo.removeConnectionTitle" })
    expect(topology().Connections).toHaveLength(1)
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "admin.exTopo.removeConnection" })) })
    expect(topology().Connections).toHaveLength(0)
    expect(topology().Devices).toHaveLength(2)
  })

  it("warns that a device's connections go with it", () => {
    render(<Harness />)
    connectHostAndSwitch()
    fireEvent.contextMenu(within(diagram()).getByRole("button", { name: "host-1" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "admin.exTopo.removeDevice" }))
    expect(screen.getByRole("dialog", { name: "admin.exTopo.removeDeviceTitle" })).toHaveTextContent("admin.exTopo.removeDeviceConfirmLinks")
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.canvasCancel" }))
    addNode("container")
    fireEvent.contextMenu(within(diagram()).getByRole("button", { name: "host-2" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "admin.exTopo.removeDevice" }))
    expect(screen.getByRole("dialog", { name: "admin.exTopo.removeDeviceTitle" })).toHaveTextContent("admin.exTopo.removeDeviceConfirm")
    expect(screen.getByRole("dialog", { name: "admin.exTopo.removeDeviceTitle" })).not.toHaveTextContent("removeDeviceConfirmLinks")
  })

  it("opens the device inspector read-only from the canvas menu when the editor is locked", () => {
    const draft = emptyDraft()
    draft.Variants[0].Topology.VPN.Enabled = true
    render(<Harness disabled draft={draft} />)
    fireEvent.contextMenu(within(diagram()).getByRole("button", { name: "admin.exTopo.vpn" }))
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["admin.exTopo.configure"])
    fireEvent.click(screen.getByRole("menuitem", { name: "admin.exTopo.configure" }))
    expect(screen.getByRole("complementary", { name: "admin.exTopo.deviceSettings" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "admin.exTopo.renameDevice: admin.exTopo.vpn" })).toBeDisabled()
  })
})
