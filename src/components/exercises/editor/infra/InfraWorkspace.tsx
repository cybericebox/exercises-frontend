"use client"

import { useCallback, useDeferredValue, useEffect, useRef, useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { Maximize2, Minimize2, Plus, Trash2 } from "lucide-react"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { containerNameError, emptyDevice, type DraftFormValues } from "@/lib/exerciseSchemas"
import type { DeviceSection, InfraView } from "@/lib/editorPosition"
import { availableDevicePorts, shortForwardingPort } from "@/lib/topologyPorts"
import { gatewayLabelFor } from "@/lib/topologyGatewayLabels"
import { deliveriesOfTask } from "@/lib/editor/refs"
import type { DeviceType } from "@/api/exercises/versions"
import { useEditorPosition } from "../../EditorPosition"
import { TopologyConnectionDialog } from "../../TopologyConnectionDialog"
import { TopologyDiagram } from "../../TopologyDiagram"
import { TopologyGlyph } from "../../TopologyGlyph"
import { SidePanel, SummaryList, ViewToolbar } from "../kit"
import { useEditor } from "../context"
import { ActionsSlotContext } from "./ActionsSlot"
import { ConnectionsTable } from "./ConnectionsTable"
import { DeviceDialog } from "./DeviceDialog"
import { DevicesTable } from "./DevicesTable"
import { GatewayDialog } from "./GatewayDialog"
import { NodePanel } from "./NodePanel"
import { VariablesTable } from "./VariablesTable"
import { focusFieldSoon } from "./focus"
import type { VariableUse } from "./varUsage"
import { cn } from "@/utils/cn"

const VIEWS: InfraView[] = ["diagram", "devices", "connections", "vars"]
const DEVICE_OPTIONS: { type: DeviceType; label: string; prefix: string }[] = [
  { type: "node", label: "admin.exTopo.type.container", prefix: "host" },
  { type: "unmanaged-switch", label: "admin.exTopo.type.switch", prefix: "sw" },
  { type: "hub", label: "admin.exTopo.type.hub", prefix: "hub" },
]
const PANEL_WIDTH = "xl:w-[23.75rem]"

/**
 * «Інфраструктура» of one variant: the sub-view row (Схема, Пристрої, Зʼєднання, Змінні), the schema canvas with the one
 * side panel, the tables, and the dialogs of the nodes. The form owns the topology; only the view, the selection and
 * transient actions live here (the opened node and its section are the editor's position, so «Перейти» can open them).
 */
export function InfraWorkspace() {
  const { variantIndex, disabled, resources, goTo } = useEditor()
  const { control, getValues, setValue } = useFormContext<DraftFormValues>()
  const base = `Variants.${variantIndex}.Topology` as const
  // The base of this variant, read here from the form: the editor's own value can lag behind a variant switch.
  const linkedTo = useWatch({ control, name: `Variants.${variantIndex}.LinkedTo` })
  const variantIds = useWatch({ control, name: "Variants", compute: (variants: DraftFormValues["Variants"]) => variants.map((variant) => variant.ID) })
  const ownBase = linkedTo ? variantIds.findIndex((id) => id !== "" && id === linkedTo) : -1
  const baseIndex = ownBase
  const linked = baseIndex >= 0
  const readOnly = disabled || linked
  const topology = useWatch({ control, name: base })
  const diagramTopology = useDeferredValue(topology)
  const devices = topology?.Devices ?? []
  const [view, setView] = useEditorPosition("infraView")
  const [openNode, setOpenNode] = useEditorPosition("openNode")
  const [section, setSection] = useEditorPosition("deviceSection")
  const [selected, setSelected] = useState<string | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null)
  const [expandedConnection, setExpandedConnection] = useState<number | null>(null)
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null)
  const [pendingEdgeRemoval, setPendingEdgeRemoval] = useState<number | null>(null)
  const [connectMode, setConnectMode] = useState(false)
  const [linkNodes, setLinkNodes] = useState<string[]>([])
  const [fullscreen, setFullscreen] = useState(false)
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const canvasView = view === "diagram"
  const activeView: InfraView = VIEWS.includes(view) ? view : "diagram"
  const returnFocus = useRef<HTMLElement | null>(null)

  const connectionsOf = (key: string) => (topology?.Connections ?? []).filter((connection) => connection.Endpoints.some((endpoint) => endpoint.Kind === key || (endpoint.Kind === "device" && endpoint.DeviceID === key)))
  const nodeExists = (key: string) => devices.some((device) => device.ID === key) || (key === "vpn" && topology?.VPN.Enabled) || (key === "internet" && topology?.Internet.Enabled)

  // A node that is gone (deleted, or another variant) cannot stay selected or open.
  useEffect(() => {
    if (!topology) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the selection follows the nodes that exist
    if (selected && !nodeExists(selected)) setSelected(null)
    if (openNode && !nodeExists(openNode)) setOpenNode("")
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nodeExists reads topology
  }, [topology, selected, openNode])

  useEffect(() => {
    if (!connectMode || linkNodes.length === 2) return
    const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { setConnectMode(false); setLinkNodes([]) } }
    document.addEventListener("keydown", onEscape)
    return () => document.removeEventListener("keydown", onEscape)
  }, [connectMode, linkNodes.length])

  useEffect(() => {
    if (!fullscreen) return
    const onChange = () => { if (!document.fullscreenElement) setFullscreen(false) }
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [fullscreen])

  const visualPatch = (key: "positions" | "labelOffsets" | "portLabelOffsets", id: string, value: { x: number; y: number }) => {
    const visual = getValues(`${base}.VisualRender`) ?? {}
    const current = visual[key] && typeof visual[key] === "object" && !Array.isArray(visual[key]) ? visual[key] as Record<string, unknown> : {}
    setValue(`${base}.VisualRender`, { ...visual, version: 1, [key]: { ...current, [id]: value } }, { shouldDirty: true })
  }

  function addDevice(type: DeviceType, position?: { x: number; y: number }) {
    const option = DEVICE_OPTIONS.find((candidate) => candidate.type === type)!
    const names = new Set(devices.map((device) => device.Name))
    let number = 1
    while (names.has(`${option.prefix}-${number}`)) number++
    const device = emptyDevice()
    device.Name = `${option.prefix}-${number}`
    device.Type = type
    if (type !== "node") device.Interfaces = []
    setValue(`${base}.Devices`, [...getValues(`${base}.Devices`), device], { shouldDirty: true, shouldValidate: true })
    if (position) visualPatch("positions", device.ID, position)
    setView("diagram")
    setSelected(device.ID)
    setSelectedEdge(null)
  }

  function addGateway(kind: "vpn" | "internet", position?: { x: number; y: number }) {
    const branch = kind === "vpn" ? "VPN" : "Internet"
    if (getValues(`${base}.${branch}.Enabled`)) return
    setValue(`${base}.${branch}.Enabled`, true, { shouldDirty: true, shouldValidate: true })
    if (position) visualPatch("positions", kind, position)
    setView("diagram")
    setSelected(kind)
    setSelectedEdge(null)
  }

  function renameNode(key: string, draft: string): string | null {
    const name = draft.trim()
    const device = devices.find((candidate) => candidate.ID === key)
    const error = device?.Type === "node" ? containerNameError(name) : name ? null : t("admin.ex.val.deviceDisplayName")
    if (error) return error
    const labelOf = (kind: "vpn" | "internet") => gatewayLabelFor(topology?.VisualRender ?? null, kind, t(`admin.exTopo.${kind}`))
    if (devices.some((candidate) => candidate.ID !== key && candidate.Name === name)
      || (["vpn", "internet"] as const).some((kind) => kind !== key && (kind === "vpn" ? topology?.VPN.Enabled : topology?.Internet.Enabled) && labelOf(kind) === name)) return t("admin.ex.err.deviceNameDuplicate")
    const index = devices.findIndex((candidate) => candidate.ID === key)
    if (index >= 0) setValue(`${base}.Devices.${index}.Name`, name, { shouldDirty: true, shouldValidate: true })
    else if (key === "vpn" || key === "internet") {
      const visual = getValues(`${base}.VisualRender`) ?? {}
      const labels = visual.gatewayLabels && typeof visual.gatewayLabels === "object" && !Array.isArray(visual.gatewayLabels) ? visual.gatewayLabels as Record<string, unknown> : {}
      setValue(`${base}.VisualRender`, { ...visual, version: 1, gatewayLabels: { ...labels, [key]: name } }, { shouldDirty: true })
    }
    return null
  }

  /** Opens the editor of a node (a dialog); a field path focuses the exact control once the section is there. */
  const openEditor = useCallback((key: string, nextSection: DeviceSection = "main", field?: string[]) => {
    returnFocus.current = document.activeElement as HTMLElement | null
    setSelected(key)
    setSelectedEdge(null)
    setSection(nextSection)
    setOpenNode(key)
    if (field) focusFieldSoon(field)
  }, [setSection, setOpenNode])

  function closeEditor() {
    setOpenNode("")
    window.setTimeout(() => returnFocus.current?.focus?.(), 0)
  }

  function openUse(use: VariableUse) {
    if (use.kind === "device") openEditor(use.deviceId, use.section, use.field)
    else goTo({ tab: "tasks", variant: variantIndex, task: use.taskIndex, condition: use.conditionIndex })
  }

  // Connections: who can still take one.
  const unavailableNodes = [
    ...devices.filter((device) => availableDevicePorts({ Connections: topology?.Connections ?? [] }, device).length === 0).map((device) => device.ID),
    ...(["vpn", "internet"] as const).filter((kind) => (kind === "vpn" ? topology?.VPN.Enabled : topology?.Internet.Enabled) && connectionsOf(kind).length > 0),
  ]
  const nodeCount = devices.length + (topology?.VPN.Enabled ? 1 : 0) + (topology?.Internet.Enabled ? 1 : 0)
  const linkUnavailableReason = nodeCount < 2 ? t("admin.exTopo.needTwoDevices") : nodeCount - unavailableNodes.length < 2 ? t("admin.exTopo.needFreePorts") : null
  const pendingPair = connectMode && linkNodes.length === 2 ? linkNodes as [string, string] : null

  function selectNode(key: string) {
    if (connectMode && unavailableNodes.includes(key)) return
    if (!connectMode) { setSelected(key); setSelectedEdge(null); return }
    setLinkNodes((current) => current.length === 0 || current.length === 2 ? [key] : current[0] === key ? [] : [current[0], key])
  }
  const cancelConnect = () => { setConnectMode(false); setLinkNodes([]) }

  function nodeName(key: string): string {
    if (key === "vpn" || key === "internet") return gatewayLabelFor(topology?.VisualRender ?? null, key, t(`admin.exTopo.${key}`))
    return devices.find((device) => device.ID === key)?.Name || t("admin.exTopo.unnamedDevice")
  }
  function connectionName(index: number) {
    const [first, second] = topology?.Connections[index]?.Endpoints ?? []
    const side = (endpoint: typeof first) => !endpoint ? "—" : `${nodeName(endpoint.Kind === "device" ? endpoint.DeviceID : endpoint.Kind)} · ${endpoint.Interface ? shortForwardingPort(endpoint.Interface) : "—"}`
    return { first: side(first), second: side(second) }
  }

  function confirmRemoval() {
    if (!pendingRemoval) return
    const target = pendingRemoval
    setValue(`${base}.Connections`, getValues(`${base}.Connections`).filter((connection) => !connection.Endpoints.some((endpoint) => endpoint.Kind === target || (endpoint.Kind === "device" && endpoint.DeviceID === target))), { shouldDirty: true, shouldValidate: true })
    if (target === "vpn" || target === "internet") {
      setValue(`${base}.${target === "vpn" ? "VPN" : "Internet"}.Enabled`, false, { shouldDirty: true, shouldValidate: true })
      const visual = getValues(`${base}.VisualRender`)
      if (visual?.gatewayLabels && typeof visual.gatewayLabels === "object" && !Array.isArray(visual.gatewayLabels)) {
        const gatewayLabels = { ...visual.gatewayLabels as Record<string, unknown> }
        delete gatewayLabels[target]
        setValue(`${base}.VisualRender`, { ...visual, gatewayLabels }, { shouldDirty: true })
      }
    } else {
      setValue(`${base}.Devices`, getValues(`${base}.Devices`).filter((device) => device.ID !== target), { shouldDirty: true, shouldValidate: true })
    }
    if (selected === target) setSelected(null)
    if (openNode === target) setOpenNode("")
    setSelectedEdge(null)
    setLinkNodes((nodes) => nodes.filter((key) => key !== target))
    setPendingRemoval(null)
  }

  function confirmEdgeRemoval() {
    if (pendingEdgeRemoval === null) return
    const index = pendingEdgeRemoval
    setValue(`${base}.Connections`, getValues(`${base}.Connections`).filter((_, candidate) => candidate !== index), { shouldDirty: true, shouldValidate: true })
    setSelectedEdge(null)
    setExpandedConnection(null)
    setPendingEdgeRemoval(null)
  }

  const removalTitle = pendingRemoval ? t(pendingRemoval === "vpn" || pendingRemoval === "internet" ? "ed.c.remove.titleGateway" : "ed.c.remove.titleDevice", { name: nodeName(pendingRemoval) }) : ""
  const removalDescription = pendingRemoval ? [
    t(pendingRemoval === "vpn" || pendingRemoval === "internet" ? "ed.c.remove.gatewayGone" : "ed.c.remove.deviceGone", { name: nodeName(pendingRemoval) }),
    connectionsOf(pendingRemoval).length ? t("ed.c.remove.withConnections", { n: connectionsOf(pendingRemoval).length }) : t("ed.c.remove.noConnections"),
    ...(() => {
      if (!topology || pendingRemoval === "vpn" || pendingRemoval === "internet") return []
      const names = (getValues(`Variants.${variantIndex}.Tasks`) ?? []).filter((task) => (task.Check?.Kind === "state" && task.Check.State.Conditions.some((condition) => condition.DeviceID === pendingRemoval))
        || deliveriesOfTask(topology, task.Key).some((delivery) => delivery.deviceId === pendingRemoval)).map((task) => `«${task.Name}»`)
      return names.length ? [t("ed.c.remove.usedBy", { tasks: names.join(", ") })] : []
    })(),
  ].join(" ") : ""

  const readOnlyReason = linked ? t("ed.c.panel.linkedReason", { n: baseIndex + 1 }) : t("ed.c.panel.editOff")
  const openIndex = devices.findIndex((device) => device.ID === openNode)

  const addDeviceMenu = !readOnly && activeView !== "vars" && <DropdownMenu>
    <DropdownMenuTrigger asChild><Button type="button" variant="outline"><Plus aria-hidden="true" className="mr-1 h-4 w-4" />{t("admin.exTopo.addDevice")}</Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      {DEVICE_OPTIONS.map((option) => <DropdownMenuItem key={option.type} className="gap-2" onSelect={() => addDevice(option.type)}>
        <TopologyGlyph kind={option.type === "node" ? "host" : option.type === "hub" ? "hub" : "switch"} className="h-5 w-5 shrink-0" />{t(option.label)}
      </DropdownMenuItem>)}
      {(["vpn", "internet"] as const).map((kind) => <DropdownMenuItem key={kind} disabled={kind === "vpn" ? topology?.VPN.Enabled : topology?.Internet.Enabled} className="gap-2" onSelect={() => addGateway(kind)}>
        <TopologyGlyph kind={kind} className="h-5 w-5 shrink-0" />{t(`admin.exTopo.${kind}`)}
        {(kind === "vpn" ? topology?.VPN.Enabled : topology?.Internet.Enabled) && <span className="ml-auto text-xs text-muted-foreground">{t("ed.c.toolbar.alreadyAdded")}</span>}
      </DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>
  const connectButton = !readOnly && activeView === "diagram" && !connectMode && <HoverTooltip text={linkUnavailableReason ?? t("admin.exTopo.addConnection")} describe={linkUnavailableReason !== null ? "always" : false}>
    <Button type="button" variant="outline" aria-disabled={linkUnavailableReason !== null || undefined} className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
      onClick={() => { if (linkUnavailableReason !== null) return; setConnectMode(true); setLinkNodes([]) }}><Plus aria-hidden="true" className="mr-1 h-4 w-4" />{t("admin.exTopo.addConnection")}</Button>
  </HoverTooltip>

  const toggleFullscreen = () => {
    if (fullscreen) { setFullscreen(false); if (document.fullscreenElement === document.documentElement) void document.exitFullscreen?.().catch(() => {}); return }
    setFullscreen(true)
    void document.documentElement.requestFullscreen?.().catch(() => {})
  }

  const panelOpen = canvasView && (selected !== null || selectedEdge !== null)
  const edgeNames = selectedEdge !== null ? connectionName(selectedEdge) : null

  return <ActionsSlotContext.Provider value={slot}>
    <section data-testid="topology-workspace" className={fullscreen ? "fixed inset-0 z-(--ib-z-canvas) flex h-dvh min-h-0 min-w-0 flex-col bg-background" : "topology-workspace"}>
      {!fullscreen && <ViewToolbar className="topology-subtabs [&>div:first-child]:flex-1" add={undefined}>
        <nav aria-label={t("ed.c.views.aria")} className="topology-views">
          {VIEWS.map((item) => <button key={item} type="button" aria-current={activeView === item ? "page" : undefined}
            onClick={() => { cancelConnect(); setExpandedConnection(null); if (fullscreen) toggleFullscreen(); setView(item) }}>{t(`ed.c.views.${item}`)}</button>)}
        </nav>
        {linked && <span className="text-sm text-muted-foreground">{t("ed.c.views.linkedNote", { n: baseIndex + 1 })}</span>}
        <span className="flex-1" />
        {addDeviceMenu}{connectButton}
        <div ref={setSlot} className="flex flex-wrap items-center gap-2" />
        {resources}
        {canvasView && <HoverTooltip text={t("admin.exTopo.expandCanvasTip")}>
          <Button type="button" variant="outline" size="icon" onClick={toggleFullscreen} aria-label={t("admin.exTopo.expandCanvas")} className="h-9 w-9"><Maximize2 aria-hidden="true" className="h-4 w-4" /></Button>
        </HoverTooltip>}
      </ViewToolbar>}

      {canvasView && <div data-testid="topology-canvas-layout" className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden xl:flex-row xl:gap-2">
        <div data-testid="topology-canvas-surface" className={cn("relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background", !fullscreen && "rounded-md border border-border")}>
          {fullscreen && <div className="topology-float-actions">{addDeviceMenu}{connectButton}</div>}
          {connectMode && <div className="topology-connect-hint" role="status">
            <span>{linkNodes.length === 0 ? t("admin.exTopo.canvasSelectFirst") : t("admin.exTopo.canvasSelectSecond")}</span>
            <Button type="button" variant="outline" size="sm" onClick={cancelConnect}>{t("admin.exTopo.canvasCancel")}</Button>
          </div>}
          <div className="relative min-h-0 flex-1 overflow-auto">
            {diagramTopology && <TopologyDiagram topology={diagramTopology}
              onPositionChange={readOnly ? undefined : (key, position) => visualPatch("positions", key, position)}
              onLabelOffsetChange={readOnly ? undefined : (key, offset) => visualPatch("labelOffsets", key, offset)}
              onPortLabelOffsetChange={readOnly ? undefined : (key, offset) => visualPatch("portLabelOffsets", key, offset)}
              onNodeRename={readOnly ? undefined : renameNode}
              selectedNodes={connectMode ? linkNodes : selected ? [selected] : []} connectionMode={connectMode} unavailableConnectionNodes={unavailableNodes}
              selectedConnectionIndex={selectedEdge} onEdgeSelect={(index) => { setSelectedEdge(index); setSelected(null) }}
              onNodeSelect={selectNode} onNodeSettings={(key) => openEditor(key)}
              nodeSettingsLabel={readOnly ? t("ed.c.panel.view") : t("ed.c.panel.configure")}
              nodeSettingsBlocked={(key) => { const device = devices.find((candidate) => candidate.ID === key); return device && device.Type !== "node" ? t("ed.c.panel.noSettings") : null }}
              onEdgeSettings={(index) => { cancelConnect(); setView("connections"); setExpandedConnection(index) }}
              onEdgeRemove={readOnly ? undefined : setPendingEdgeRemoval} linkUnavailableReason={linkUnavailableReason}
              onNodeRemove={readOnly ? undefined : setPendingRemoval}
              onNodeLinkStart={readOnly ? undefined : (key) => { if (unavailableNodes.includes(key)) return; setSelected(key); setConnectMode(true); setLinkNodes([key]) }}
              onCanvasSelect={() => { if (!connectMode) { setSelected(null); setSelectedEdge(null) } }}
              onCanvasAddNode={readOnly ? undefined : (kind, position) => kind === "vpn" || kind === "internet" ? addGateway(kind, position) : addDevice(kind, position)}
              onCanvasLinkStart={readOnly ? undefined : () => { setConnectMode(true); setLinkNodes([]) }}
              controlsPosition="top-right" toolbarExtra={fullscreen ? <HoverTooltip text={t(fullscreen ? "admin.exTopo.collapseCanvasTip" : "admin.exTopo.expandCanvasTip")}>
                <Button type="button" variant="ghost" size="icon" onClick={toggleFullscreen} aria-label={t(fullscreen ? "admin.exTopo.collapseCanvas" : "admin.exTopo.expandCanvas")} className="h-8 w-8">
                  <Minimize2 aria-hidden="true" className="h-4 w-4" />
                </Button></HoverTooltip> : undefined} />}
          </div>
        </div>
        {panelOpen && <div className={cn("absolute inset-y-0 right-0 z-10 flex w-full max-w-[23.75rem] min-h-0 min-w-0 flex-col xl:relative xl:max-w-none xl:flex-none", PANEL_WIDTH)}>
          {selected !== null
            ? <NodePanel key={selected} variantIndex={variantIndex} nodeKey={selected} readOnly={readOnly} readOnlyReason={readOnlyReason} onClose={() => setSelected(null)}
              onConfigure={(nextSection) => openEditor(selected, nextSection ?? "main")} onDelete={() => setPendingRemoval(selected)} />
            : edgeNames && selectedEdge !== null && <SidePanel className="bg-background" title={t("ed.c.edge.title", { n: selectedEdge + 1 })} subtitle={t("ed.c.edge.subtitle")} onClose={() => setSelectedEdge(null)}
              footer={<>
                <Button type="button" variant="outline" onClick={() => { setView("connections"); setExpandedConnection(selectedEdge) }}>{readOnly ? t("ed.c.panel.view") : t("ed.c.panel.configure")}</Button>
                <HoverTooltip text={readOnly ? readOnlyReason : t("ed.c.panel.delete")} describe={readOnly ? "always" : false}>
                  <Button type="button" variant="outline" size="icon" aria-label={t("ed.c.panel.delete")} aria-disabled={readOnly || undefined}
                    className="text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                    onClick={() => { if (!readOnly) setPendingEdgeRemoval(selectedEdge) }}><Trash2 aria-hidden="true" className="h-4 w-4" /></Button>
                </HoverTooltip>
              </>}>
              <SummaryList rows={[{ key: "first", label: t("ed.c.edge.first"), value: edgeNames.first }, { key: "second", label: t("ed.c.edge.second"), value: edgeNames.second }]} />
            </SidePanel>}
        </div>}
      </div>}

      {activeView === "devices" && <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <DevicesTable variantIndex={variantIndex} readOnly={readOnly} selectedKey={selected}
          onShow={(key) => { setSelected(key); setView("diagram") }} onConfigure={(key) => { setView("diagram"); openEditor(key) }} onRemove={setPendingRemoval} />
      </div>}
      {activeView === "connections" && <ConnectionsTable variantIndex={variantIndex} readOnly={readOnly} expandedIndex={expandedConnection} onExpand={setExpandedConnection}
        selectedIndex={selectedEdge} onShow={(index) => { setSelectedEdge(index); setSelected(null); setView("diagram") }}
        onAdded={(index) => setExpandedConnection(index)} />}
      {activeView === "vars" && <VariablesTable variantIndex={variantIndex} disabled={readOnly} onOpenUse={openUse} />}

      {!readOnly && <TopologyConnectionDialog variantIndex={variantIndex} pair={pendingPair} onClose={cancelConnect}
        onAdd={(first, second) => { setValue(`${base}.Connections`, [...getValues(`${base}.Connections`), { Endpoints: [first, second] }], { shouldDirty: true, shouldValidate: true }); cancelConnect() }} />}

      {openNode && openIndex >= 0 && devices[openIndex].Type === "node" && <DeviceDialog variantIndex={variantIndex} deviceIndex={openIndex} section={section} onSection={setSection} onClose={closeEditor}
        readOnly={readOnly} linkedBaseIndex={linked ? baseIndex : undefined} imageEditable={linked && !disabled}
        onOpenVariables={() => { closeEditor(); setView("vars") }} />}
      {(openNode === "vpn" || openNode === "internet") && nodeExists(openNode) && <GatewayDialog variantIndex={variantIndex} kind={openNode} disabled={readOnly} onClose={closeEditor} />}

      <ConfirmDialog open={pendingRemoval !== null} onCancel={() => setPendingRemoval(null)} tone="danger" title={removalTitle} description={removalDescription}
        cancelLabel={t("admin.exTopo.canvasCancel")} confirmLabel={pendingRemoval === "vpn" || pendingRemoval === "internet" ? t("ed.c.remove.gateway") : t("admin.exTopo.removeDevice")}
        busyLabel={t("ed.c.remove.busy")} onConfirm={confirmRemoval} />
      <ConfirmDialog open={pendingEdgeRemoval !== null} onCancel={() => setPendingEdgeRemoval(null)} tone="danger" title={t("admin.exTopo.removeConnectionTitle")}
        description={pendingEdgeRemoval !== null ? t("admin.exTopo.removeConnectionConfirm", connectionName(pendingEdgeRemoval)) : undefined}
        cancelLabel={t("admin.exTopo.canvasCancel")} confirmLabel={t("admin.exTopo.removeConnection")} onConfirm={confirmEdgeRemoval} />
    </section>
  </ActionsSlotContext.Provider>
}

