"use client"

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent } from "react"
import { useFieldArray, useFormContext, useWatch } from "react-hook-form"
import { GripVertical, Images, Maximize2, Minimize2, Pencil, Plus, X } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { FieldHelp } from "@/components/ui/field-help"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { DNS_LABEL_RE, emptyDevice, type DraftFormValues } from "@/lib/exerciseSchemas"
import { availableDevicePorts } from "@/lib/topologyPorts"
import { TOPOLOGY_ICONS, topologyIconFor, type TopologyIconKey } from "@/lib/topologyIcons"
import { gatewayLabelFor } from "@/lib/topologyGatewayLabels"
import type { DeviceType } from "@/api/exercises/versions"
import { NetworkToggles } from "./NetworkToggles"
import { DeviceCard } from "./DeviceCard"
import { ConnectionList } from "./ConnectionList"
import { TopologyConnectionDialog } from "./TopologyConnectionDialog"
import { TopologyDeviceOverview } from "./TopologyDeviceOverview"
import { TopologyDiagram } from "./TopologyDiagram"
import { TopologyGlyph } from "./TopologyGlyph"
import { useEditorPosition } from "./EditorPosition"

type Gateway = "vpn" | "internet"
const INSPECTOR_WIDTH_KEY = "cybericebox:topology-inspector-width"
const INSPECTOR_DEFAULT_WIDTH = 480
const INSPECTOR_MIN_WIDTH = 448
const INSPECTOR_MAX_WIDTH = 720
const MIN_CANVAS_WIDTH = 560
const INSPECTOR_GAP = 8
function initialInspectorWidth() {
  if (typeof window === "undefined") return INSPECTOR_DEFAULT_WIDTH
  try {
    const raw = window.localStorage?.getItem(INSPECTOR_WIDTH_KEY)
    if (raw !== null && raw !== undefined) {
      const stored = Number(raw)
      if (Number.isInteger(stored) && stored > 0) return Math.max(INSPECTOR_MIN_WIDTH, Math.min(INSPECTOR_MAX_WIDTH, stored))
    }
  } catch { /* Browser storage can be unavailable; the default width still works. */ }
  return INSPECTOR_DEFAULT_WIDTH
}
const DEVICE_OPTIONS: { type: DeviceType; label: string; prefix: string }[] = [
  { type: "container", label: "admin.exTopo.type.container", prefix: "host" },
  { type: "unmanaged-switch", label: "admin.exTopo.type.switch", prefix: "sw" },
  { type: "hub", label: "admin.exTopo.type.hub", prefix: "hub" },
]

/** The form owns topology; only view, selection and transient actions live here. */
/** Help lines of each topology tab: admin.exTopo.tabHelp.<tab>.<line>. */
const TAB_HELP = {
  diagram: ["what", "connect"],
  devices: ["what", "open"],
  connections: ["what", "gateway"],
} as const

export function TopologySection({ variantIndex, disabled }: { variantIndex: number; disabled: boolean }) {
  const { control, getValues, setValue } = useFormContext<DraftFormValues>()
  const base = `Variants.${variantIndex}.Topology` as const
  const { fields, append, remove } = useFieldArray({ control, name: `${base}.Devices` })
  const topology = useWatch({ control, name: base })
  const devices = (topology?.Devices ?? []).slice(0, fields.length)
  const [activeSection, setActiveSection] = useEditorPosition("topologySection")
  const view = activeSection === "connections" ? "connections"
    : activeSection === "devices" || activeSection === "gateways" ? "devices" : "diagram"
  const [selectedKeyState, setSelectedKey] = useState<string | null>(null)
  const selectedKey = activeSection.startsWith("device:") ? activeSection.slice("device:".length) : selectedKeyState
  const [selectedConnectionIndex, setSelectedConnectionIndex] = useState<number | null>(null)
  const [settingsTargetState, setSettingsTarget] = useState<string | null>(null)
  const settingsTarget = activeSection.startsWith("device:") ? activeSection.slice("device:".length) : settingsTargetState
  const [renamingKey, setRenamingKey] = useState<string | null>(null)
  const [nameDraft, setNameDraft] = useState("")
  const [nameError, setNameError] = useState("")
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null)
  const [connectMode, setConnectMode] = useState(false)
  const [linkNodes, setLinkNodes] = useState<string[]>([])
  const [canvasExpanded, setCanvasExpanded] = useState(false)
  const [inspectorWidth, setInspectorWidth] = useState(initialInspectorWidth)
  const [layoutWidth, setLayoutWidth] = useState(1280)
  const inspectorWidthRef = useRef(inspectorWidth)
  const resizePointer = useRef<number | null>(null)
  const layoutRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const inspectorMaxWidth = Math.max(INSPECTOR_MIN_WIDTH, Math.min(INSPECTOR_MAX_WIDTH, layoutWidth - MIN_CANVAS_WIDTH - INSPECTOR_GAP))
  const displayedInspectorWidth = Math.min(inspectorWidth, inspectorMaxWidth)
  const settingsDeviceIndex = devices.findIndex((device) => device.ID === settingsTarget)
  const settingsGateway = settingsTarget === "vpn" || settingsTarget === "internet" ? settingsTarget : null
  const settingsName = settingsGateway
    ? gatewayLabelFor(topology?.VisualRender ?? null, settingsGateway, t(`admin.exTopo.${settingsGateway}`))
    : settingsDeviceIndex >= 0 ? devices[settingsDeviceIndex].Name : null
  const settingsDescriptionKind = settingsGateway
    ? settingsGateway
    : settingsDeviceIndex >= 0 && devices[settingsDeviceIndex].Type !== "container"
      ? devices[settingsDeviceIndex].Type === "hub" ? "hub" : "switch"
      : null
  const availableNodes = new Set([
    ...devices.map((device) => device.ID),
    ...(topology?.VPN.Enabled ? ["vpn"] : []),
    ...(topology?.Internet.Enabled ? ["internet"] : []),
  ])
  const unavailableConnectionNodes = [
    ...devices.filter((device) => availableDevicePorts({ Connections: topology?.Connections ?? [] }, device).length === 0).map((device) => device.ID),
    ...(["vpn", "internet"] as const).filter((kind) => (topology?.[kind === "vpn" ? "VPN" : "Internet"].Enabled ?? false)
      && (topology?.Connections ?? []).some((connection) => connection.Endpoints.some((endpoint) => endpoint.Kind === kind))),
  ]
  const freeConnectionNodeCount = availableNodes.size - unavailableConnectionNodes.length
  const pendingPair = connectMode && linkNodes.length === 2 ? linkNodes as [string, string] : null
  const linkedCount = (topology?.Connections ?? []).filter((connection) => connection.Endpoints.some((endpoint) =>
    endpoint.Kind === pendingRemoval || (endpoint.Kind === "device" && endpoint.DeviceID === pendingRemoval))).length

  useEffect(() => {
    // With the choice dialog open, its nested port menu owns Escape. Do not
    // cancel the whole connection just because that menu was dismissed.
    if (!connectMode || linkNodes.length === 2) return
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") { setConnectMode(false); setLinkNodes([]) }
    }
    document.addEventListener("keydown", onEscape)
    return () => document.removeEventListener("keydown", onEscape)
  }, [connectMode, linkNodes.length])

  useEffect(() => {
    if (!renamingKey) return
    nameInputRef.current?.focus()
    nameInputRef.current?.select()
  }, [renamingKey])

  useEffect(() => {
    if (!canvasExpanded) return
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setCanvasExpanded(false)
    }
    document.addEventListener("fullscreenchange", onFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange)
  }, [canvasExpanded])

  useEffect(() => {
    const layout = layoutRef.current
    if (!layout || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(([entry]) => {
      if (entry?.contentRect.width > 0) setLayoutWidth(entry.contentRect.width)
    })
    observer.observe(layout)
    return () => observer.disconnect()
  }, [view])

  function resizeInspector(next: number, max = inspectorMaxWidth) {
    const width = Math.max(INSPECTOR_MIN_WIDTH, Math.min(max, Math.round(next)))
    inspectorWidthRef.current = width
    setInspectorWidth(width)
  }

  function saveInspectorWidth() {
    try { window.localStorage?.setItem(INSPECTOR_WIDTH_KEY, String(inspectorWidthRef.current)) }
    catch { /* Resizing still works for this session if storage is blocked. */ }
  }

  function resizeInspectorWithKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    const next = event.key === "ArrowLeft" ? displayedInspectorWidth + 24
      : event.key === "ArrowRight" ? displayedInspectorWidth - 24
      : event.key === "Home" ? INSPECTOR_MIN_WIDTH
      : event.key === "End" ? inspectorMaxWidth : null
    if (next === null) return
    event.preventDefault()
    resizeInspector(next)
    saveInspectorWidth()
  }

  function moveInspectorDivider(event: PointerEvent<HTMLDivElement>) {
    if (resizePointer.current !== event.pointerId) return
    const rect = layoutRef.current?.getBoundingClientRect()
    if (!rect) return
    const max = Math.max(INSPECTOR_MIN_WIDTH, Math.min(INSPECTOR_MAX_WIDTH, rect.width - MIN_CANVAS_WIDTH - INSPECTOR_GAP))
    resizeInspector(rect.right - event.clientX, max)
  }

  function exitExpandedCanvas() {
    setCanvasExpanded(false)
    if (document.fullscreenElement === document.documentElement) void document.exitFullscreen?.().catch(() => {})
  }

  function toggleExpandedCanvas() {
    if (canvasExpanded) { exitExpandedCanvas(); return }
    setCanvasExpanded(true)
    void document.documentElement.requestFullscreen?.().catch(() => {})
  }

  function moveNode(key: string, position: { x: number; y: number }) {
    const visual = getValues(`${base}.VisualRender`) ?? {}
    const positions = visual.positions && typeof visual.positions === "object" && !Array.isArray(visual.positions)
      ? visual.positions as Record<string, unknown> : {}
    setValue(`${base}.VisualRender`, { ...visual, version: 1, positions: { ...positions, [key]: position } }, { shouldDirty: true })
  }

  function setIcon(key: string, icon: TopologyIconKey) {
    const visual = getValues(`${base}.VisualRender`) ?? {}
    const icons = visual.icons && typeof visual.icons === "object" && !Array.isArray(visual.icons)
      ? visual.icons as Record<string, unknown> : {}
    setValue(`${base}.VisualRender`, { ...visual, version: 1, icons: { ...icons, [key]: icon } }, { shouldDirty: true })
  }

  function moveLabel(key: string, offset: { x: number; y: number }) {
    const visual = getValues(`${base}.VisualRender`) ?? {}
    const labelOffsets = visual.labelOffsets && typeof visual.labelOffsets === "object" && !Array.isArray(visual.labelOffsets)
      ? visual.labelOffsets as Record<string, unknown> : {}
    setValue(`${base}.VisualRender`, { ...visual, version: 1, labelOffsets: { ...labelOffsets, [key]: offset } }, { shouldDirty: true })
  }

  function movePortLabel(key: string, offset: { x: number; y: number }) {
    const visual = getValues(`${base}.VisualRender`) ?? {}
    const portLabelOffsets = visual.portLabelOffsets && typeof visual.portLabelOffsets === "object" && !Array.isArray(visual.portLabelOffsets)
      ? visual.portLabelOffsets as Record<string, unknown> : {}
    setValue(`${base}.VisualRender`, { ...visual, version: 1, portLabelOffsets: { ...portLabelOffsets, [key]: offset } }, { shouldDirty: true })
  }

  function addDevice(type: DeviceType, position?: { x: number; y: number }) {
    const option = DEVICE_OPTIONS.find((candidate) => candidate.type === type)!
    const names = new Set(devices.map((device) => device.Name))
    let number = 1
    while (names.has(`${option.prefix}-${number}`)) number++
    const device = emptyDevice()
    device.Name = `${option.prefix}-${number}`
    device.Type = type
    if (type !== "container") device.Interfaces = []
    append(device)
    if (position) moveNode(device.ID, position)
    setSelectedKey(device.ID)
    setSelectedConnectionIndex(null)
  }

  function addGateway(kind: Gateway, position?: { x: number; y: number }) {
    const branch = kind === "vpn" ? "VPN" : "Internet"
    if (getValues(`${base}.${branch}.Enabled`)) return
    setValue(`${base}.${branch}.Enabled`, true, { shouldDirty: true, shouldValidate: true })
    if (position) moveNode(kind, position)
    setSelectedKey(kind)
    setSelectedConnectionIndex(null)
  }

  function openSettings(key: string) {
    setSelectedKey(key)
    setSelectedConnectionIndex(null)
    if (renamingKey && renamingKey !== key) setRenamingKey(null)
    if (activeSection.startsWith("device:")) setActiveSection(`device:${key}`)
    else setSettingsTarget(key)
  }

  function startRename(key: string) {
    const device = devices.find((candidate) => candidate.ID === key)
    if ((!device && key !== "vpn" && key !== "internet") || disabled) return
    setNameDraft(device?.Name ?? gatewayLabelFor(topology?.VisualRender ?? null, key as Gateway, t(`admin.exTopo.${key}`)))
    setNameError("")
    setRenamingKey(key)
  }

  function renameNode(key: string, draft: string): string | null {
    const name = draft.trim()
    const device = devices.find((candidate) => candidate.ID === key)
    if (device?.Type === "container" ? !DNS_LABEL_RE.test(name) : !name) {
      return t(device?.Type === "container" ? "admin.ex.val.deviceName" : "admin.ex.val.deviceDisplayName")
    }
    if (devices.some((candidate) => candidate.ID !== key && candidate.Name === name)
      || (["vpn", "internet"] as const).some((kind) => kind !== key
        && topology?.[kind === "vpn" ? "VPN" : "Internet"].Enabled
        && gatewayLabelFor(topology?.VisualRender ?? null, kind, t(`admin.exTopo.${kind}`)) === name)) {
      return t("admin.ex.err.deviceNameDuplicate")
    }
    const index = devices.findIndex((candidate) => candidate.ID === key)
    if (index >= 0) setValue(`${base}.Devices.${index}.Name`, name, { shouldDirty: true, shouldValidate: true })
    else if (key === "vpn" || key === "internet") {
      const visual = getValues(`${base}.VisualRender`) ?? {}
      const oldLabels = visual.gatewayLabels && typeof visual.gatewayLabels === "object" && !Array.isArray(visual.gatewayLabels)
        ? visual.gatewayLabels as Record<string, unknown> : {}
      setValue(`${base}.VisualRender`, { ...visual, version: 1, gatewayLabels: { ...oldLabels, [key]: name } }, { shouldDirty: true })
    }
    return null
  }

  function commitRename() {
    if (!renamingKey) return
    const error = renameNode(renamingKey, nameDraft)
    if (error) { setNameError(error); return }
    setRenamingKey(null)
    setNameError("")
  }

  function closeSettings() {
    setSettingsTarget(null)
    setRenamingKey(null)
    setNameError("")
    if (activeSection.startsWith("device:")) setActiveSection("diagram")
  }

  function selectNode(key: string) {
    if (connectMode && unavailableConnectionNodes.includes(key)) return
    setSelectedKey(key)
    setSelectedConnectionIndex(null)
    if (!connectMode && settingsTarget) {
      if (renamingKey && renamingKey !== key) setRenamingKey(null)
      if (activeSection.startsWith("device:")) setActiveSection(`device:${key}`)
      else setSettingsTarget(key)
    }
    if (!connectMode) return
    setLinkNodes((current) => current.length === 0 || current.length === 2
      ? [key] : current[0] === key ? [] : [current[0], key])
  }

  function cancelConnect() { setConnectMode(false); setLinkNodes([]) }

  function confirmRemoval() {
    if (!pendingRemoval) return
    const target = pendingRemoval
    setValue(`${base}.Connections`, getValues(`${base}.Connections`).filter((connection) =>
      !connection.Endpoints.some((endpoint) => endpoint.Kind === target ||
        (endpoint.Kind === "device" && endpoint.DeviceID === target))), { shouldDirty: true, shouldValidate: true })
    if (target === "vpn" || target === "internet") {
      const branch = target === "vpn" ? "VPN" : "Internet"
      setValue(`${base}.${branch}.Enabled`, false, { shouldDirty: true, shouldValidate: true })
      const visual = getValues(`${base}.VisualRender`)
      if (visual?.gatewayLabels && typeof visual.gatewayLabels === "object" && !Array.isArray(visual.gatewayLabels)) {
        const gatewayLabels = { ...visual.gatewayLabels as Record<string, unknown> }
        delete gatewayLabels[target]
        setValue(`${base}.VisualRender`, { ...visual, gatewayLabels }, { shouldDirty: true })
      }
    } else {
      const index = devices.findIndex((device) => device.ID === target)
      if (index >= 0) remove(index)
    }
    if (selectedKey === target) setSelectedKey(null)
    if (activeSection === `device:${target}`) setActiveSection("diagram")
    if (settingsTarget === target) closeSettings()
    setSelectedConnectionIndex(null)
    setLinkNodes((nodes) => nodes.filter((key) => key !== target))
    setPendingRemoval(null)
  }

  return <section data-testid="topology-workspace" className={canvasExpanded
    ? "fixed inset-0 z-[45] flex h-dvh min-h-0 min-w-0 flex-col bg-background p-0"
    : "flex min-h-[32rem] min-w-0 flex-col gap-3 lg:h-[min(72dvh,48rem)]"}>
    {!canvasExpanded && <div className="flex shrink-0 items-center justify-between gap-3">
    <nav aria-label={t("admin.exDraft.topology.title")} className="inline-flex h-10 items-center rounded-md bg-muted p-1">
      {(["diagram", "devices", "connections"] as const).map((item) =>
        <button key={item} type="button" aria-current={view === item ? "page" : undefined}
          onClick={() => {
            cancelConnect()
            exitExpandedCanvas()
            if (activeSection.startsWith("device:")) setSettingsTarget(activeSection.slice("device:".length))
            setActiveSection(item)
          }}
          className={`h-8 rounded px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary ${view === item ? "bg-card font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          {t(`admin.exTopo.${item}`)}
        </button>)}
    </nav>
    {/* One help for the active tab, outside the tab buttons. */}
    <FieldHelp key={view} lines={TAB_HELP[view].map((line) => t(`admin.exTopo.tabHelp.${view}.${line}`))} />
    </div>}

    {view === "diagram" && <div ref={layoutRef} data-testid="topology-canvas-layout" className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden xl:flex-row">
    <div data-testid="topology-canvas-surface" className={canvasExpanded
      ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
      : "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-background"}>
      <div className="flex flex-wrap items-center justify-end gap-2 border-b border-border px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          {connectMode && <span className="text-xs text-muted-foreground">{linkNodes.length === 0 ? t("admin.exTopo.canvasSelectFirst") : t("admin.exTopo.canvasSelectSecond")}</span>}
          {!disabled && (connectMode ? <Button type="button" variant="outline" size="sm" onClick={cancelConnect}>{t("admin.exTopo.canvasCancel")}</Button>
            : <Button type="button" variant="outline" size="sm" disabled={freeConnectionNodeCount < 2} onClick={() => { setConnectMode(true); setLinkNodes([]) }}>
              <Plus className="mr-1 h-4 w-4" />{t("admin.exTopo.addConnection")}
            </Button>)}
          {!disabled && <DropdownMenu>
            <DropdownMenuTrigger asChild><Button type="button" variant="outline" size="sm" aria-label={t("admin.exTopo.addDevice")}><Plus className="mr-1 h-4 w-4" />{t("admin.exTopo.addDevice")}</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {DEVICE_OPTIONS.map((option) => <DropdownMenuItem key={option.type} className="gap-2" onSelect={() => addDevice(option.type)}>
                <TopologyGlyph kind={option.type === "container" ? "host" : option.type === "hub" ? "hub" : "switch"} className="h-5 w-5 shrink-0" />{t(option.label)}
              </DropdownMenuItem>)}
              <DropdownMenuItem disabled={topology?.VPN.Enabled} className="gap-2" onSelect={() => addGateway("vpn")}><TopologyGlyph kind="vpn" className="h-5 w-5 shrink-0" />{t("admin.exTopo.vpn")}</DropdownMenuItem>
              <DropdownMenuItem disabled={topology?.Internet.Enabled} className="gap-2" onSelect={() => addGateway("internet")}><TopologyGlyph kind="internet" className="h-5 w-5 shrink-0" />{t("admin.exTopo.internet")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>}
          <HoverTooltip text={t(canvasExpanded ? "admin.exTopo.collapseCanvas" : "admin.exTopo.expandCanvas")}><Button type="button" variant="ghost" size="sm" onClick={toggleExpandedCanvas}
            aria-label={t(canvasExpanded ? "admin.exTopo.collapseCanvas" : "admin.exTopo.expandCanvas")}
            className="h-8 w-8 shrink-0 p-0">
            {canvasExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button></HoverTooltip>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 overflow-auto">
        {topology && <TopologyDiagram topology={topology} onPositionChange={disabled ? undefined : moveNode}
          onLabelOffsetChange={disabled ? undefined : moveLabel}
          onPortLabelOffsetChange={disabled ? undefined : movePortLabel}
          onNodeRename={disabled ? undefined : renameNode}
          onNodeRenameStart={() => { setRenamingKey(null); setNameError("") }}
          selectedNodes={connectMode ? linkNodes : selectedKey ? [selectedKey] : []}
          connectionMode={connectMode} unavailableConnectionNodes={unavailableConnectionNodes}
          selectedConnectionIndex={selectedConnectionIndex} onEdgeSelect={(index) => { setSelectedConnectionIndex(index); setSelectedKey(null) }}
          onNodeSelect={selectNode} onNodeSettings={disabled ? undefined : openSettings}
          onNodeRemove={disabled ? undefined : setPendingRemoval}
          onNodeLinkStart={disabled ? undefined : (key) => { if (unavailableConnectionNodes.includes(key)) return; setSelectedKey(key); setConnectMode(true); setLinkNodes([key]) }}
          onCanvasSelect={() => { if (!connectMode) { if (!settingsTarget) setSelectedKey(null); setSelectedConnectionIndex(null) } }}
          onCanvasAddNode={disabled ? undefined : (kind, position) => kind === "vpn" || kind === "internet"
            ? addGateway(kind, position) : addDevice(kind, position)}
          onCanvasLinkStart={disabled || freeConnectionNodeCount < 2 ? undefined : () => { setConnectMode(true); setLinkNodes([]) }} />}
        {availableNodes.size === 0 && <EmptyState message={t("admin.exTopo.noDevices")} className="pointer-events-none absolute inset-0 min-h-0" />}
      </div>
    </div>
    {settingsTarget !== null && <aside role="complementary"
      aria-label={t("admin.exTopo.deviceSettings")}
      style={{ "--topology-inspector-width": `${displayedInspectorWidth}px` } as CSSProperties}
      className="absolute inset-y-0 right-0 z-10 flex w-[min(26rem,calc(100vw-1rem))] min-h-0 min-w-0 flex-col border-l border-border bg-background xl:relative xl:ml-2 xl:w-[var(--topology-inspector-width)] xl:min-w-[28rem] xl:max-w-[55%] xl:flex-none xl:rounded-md xl:border">
      <div role="separator" aria-orientation="vertical" aria-label={t("admin.exTopo.resizeSettings")}
        aria-valuemin={INSPECTOR_MIN_WIDTH} aria-valuemax={inspectorMaxWidth} aria-valuenow={displayedInspectorWidth}
        tabIndex={0}
        className="group absolute top-1/2 -left-4 z-20 hidden h-16 w-6 -translate-y-1/2 cursor-col-resize touch-none rounded-full focus-visible:outline-2 focus-visible:outline-primary xl:block"
        onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); resizePointer.current = event.pointerId; event.currentTarget.setPointerCapture?.(event.pointerId) }}
        onPointerMove={moveInspectorDivider}
        onPointerUp={(event) => { if (resizePointer.current !== event.pointerId) return; resizePointer.current = null; saveInspectorWidth() }}
        onPointerCancel={() => { resizePointer.current = null }}
        onKeyDown={resizeInspectorWithKeyboard}>
        <HoverTooltip text={t("admin.exTopo.resizeSettings")}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <span data-testid="topology-inspector-resize-grip" aria-hidden="true"
            className="flex h-12 w-6 items-center justify-center rounded-full border border-primary/50 bg-background text-primary group-hover:border-primary group-hover:bg-accent group-focus-visible:border-primary group-focus-visible:bg-accent">
            <GripVertical className="h-4 w-4" />
          </span>
        </HoverTooltip>
      </div>
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{t("admin.exTopo.deviceSettings")}</h3>
          {settingsName !== null && (renamingKey === settingsTarget ? <div className="mt-1 min-w-0">
            <Input ref={nameInputRef} aria-label={t("admin.exTopo.deviceName")} aria-invalid={!!nameError}
              value={nameDraft} maxLength={settingsDeviceIndex >= 0 && devices[settingsDeviceIndex].Type === "container" ? 63 : undefined}
              onChange={(event) => { setNameDraft(event.target.value); setNameError("") }}
              onBlur={commitRename} onKeyDown={(event) => {
                if (event.key === "Enter") { event.preventDefault(); commitRename() }
                if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setRenamingKey(null); setNameError("") }
              }} />
            {nameError && <p role="alert" className="mt-1 text-xs text-destructive">{nameError}</p>}
          </div> : <HoverTooltip text={t("admin.exTopo.renameDevice")} className="max-w-full">
            <button type="button" disabled={disabled} aria-label={`${t("admin.exTopo.renameDevice")}: ${settingsName}`}
              onClick={() => startRename(settingsTarget)}
              className="group mt-0.5 inline-flex max-w-full items-center gap-1.5 rounded-sm text-left text-base font-semibold text-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-default disabled:hover:text-foreground">
              <span className="min-w-0 truncate">{settingsName}</span>
              {!disabled && <Pencil aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:text-primary group-hover:opacity-100 group-focus-visible:opacity-100" />}
            </button>
          </HoverTooltip>)}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {settingsDeviceIndex >= 0 && devices[settingsDeviceIndex].Type === "container" && <DropdownMenu>
            <HoverTooltip text={t("admin.exTopo.icon.change")}><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="sm" disabled={disabled}
              aria-label={t("admin.exTopo.icon.change")} className="h-8 w-8 p-0"><Images className="h-4 w-4" /></Button></DropdownMenuTrigger></HoverTooltip>
            <DropdownMenuContent align="end" className="max-h-72 min-w-48 overflow-y-auto">
              {(Object.keys(TOPOLOGY_ICONS) as TopologyIconKey[]).map((key) =>
                <DropdownMenuItem key={key} aria-current={topologyIconFor(devices[settingsDeviceIndex], topology?.VisualRender ?? null) === key ? "true" : undefined}
                  className="flex items-center gap-2" onSelect={() => setIcon(devices[settingsDeviceIndex].ID, key)}>
                  <TopologyGlyph kind={key} className="h-6 w-6 text-foreground" />
                  {t(`admin.exTopo.icon.${key}`)}
                </DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>}
          <HoverTooltip text={t("admin.exTopo.closeSettings")}><Button type="button" variant="ghost" size="sm" aria-label={t("admin.exTopo.closeSettings")}
            className="h-8 w-8 shrink-0 p-0" onClick={closeSettings}><X className="h-4 w-4" /></Button></HoverTooltip>
        </div>
      </div>
      <div className="@container min-h-0 min-w-0 flex-1 overflow-y-auto p-3">
        {settingsDescriptionKind && <dl className="mb-3 space-y-2 border-b border-border pb-3 text-sm">
          {(["purpose", "ports"] as const).map((fact) =>
            <div key={fact} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2 leading-5">
              <dt className="font-medium text-foreground">{t(`admin.exTopo.networkFact.${fact}`)}</dt>
              <dd className="min-w-0 text-muted-foreground">
                {fact === "purpose" && (settingsDescriptionKind === "switch" || settingsDescriptionKind === "hub") ? <>
                  <p>{t(`admin.exTopo.networkDescription.${settingsDescriptionKind}.purpose`)}</p>
                  <p className="mt-1">{t(`admin.exTopo.networkDescription.${settingsDescriptionKind}.behavior`)}</p>
                </> : t(`admin.exTopo.networkDescription.${settingsDescriptionKind}.${fact}`)}
              </dd>
            </div>)}
        </dl>}
        {settingsGateway ? <NetworkToggles variantIndex={variantIndex} disabled={disabled}
          network={settingsGateway === "vpn" ? "VPN" : "Internet"} showEnabled={false} />
          : settingsDeviceIndex >= 0 && <DeviceCard key={fields[settingsDeviceIndex]?.id} variantIndex={variantIndex} deviceIndex={settingsDeviceIndex} disabled={disabled} compact />}
      </div>
    </aside>}
    </div>}

    {view === "devices" && <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto rounded-md border border-border p-2">
      {topology && <TopologyDeviceOverview topology={topology} disabled={disabled} selectedKey={selectedKey}
        onOpen={(key) => { openSettings(key); setActiveSection("diagram") }} onRemove={setPendingRemoval} />}
    </div>}

    {view === "connections" && <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto rounded-md border border-border p-3">
      <ConnectionList variantIndex={variantIndex} disabled={disabled} selectedIndex={selectedConnectionIndex}
        onSelectIndex={(index) => { setSelectedConnectionIndex(index); setSelectedKey(null) }}
        onShowInDiagram={(index) => { setSelectedConnectionIndex(index); setSelectedKey(null); setActiveSection("diagram") }} />
    </div>}

    {!disabled && <TopologyConnectionDialog variantIndex={variantIndex} pair={pendingPair} onClose={cancelConnect}
      onAdd={(first, second) => {
        setValue(`${base}.Connections`, [...getValues(`${base}.Connections`), { Endpoints: [first, second] }], { shouldDirty: true, shouldValidate: true })
        cancelConnect()
      }} />}
    <Dialog open={pendingRemoval !== null} onOpenChange={(open) => { if (!open) setPendingRemoval(null) }}>
      <DialogContent><DialogHeader><DialogTitle>{t("admin.exTopo.removeDevice")}</DialogTitle>
        <DialogDescription>{t("admin.exTopo.removeDeviceConfirm").replace("{count}", String(linkedCount))}</DialogDescription></DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setPendingRemoval(null)}>{t("admin.exTopo.canvasCancel")}</Button>
          <Button type="button" variant="destructive" onClick={confirmRemoval}>{t("admin.exTopo.removeDevice")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
}
