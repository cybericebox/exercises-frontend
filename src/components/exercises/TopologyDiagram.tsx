"use client"

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react"
import { createPortal } from "react-dom"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { Cable, ChevronDown, Maximize, Pencil, Settings2, Trash2, ZoomIn, ZoomOut } from "lucide-react"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { MAX_DEVICE_NAME_LEN, type TopologyFormValues } from "@/lib/exerciseSchemas"
import { shortForwardingPort } from "@/lib/topologyPorts"
import { topologyIconFor, type TopologyIconKey } from "@/lib/topologyIcons"
import { gatewayLabelFor } from "@/lib/topologyGatewayLabels"
import { fitViewport, initialTopologyViewport, pointInWorld, TOPOLOGY_VIEWPORT_DEFAULT, zoomViewportAt, type TopologyViewport } from "@/lib/topologyViewport"
import { TopologyGlyph, type TopologyGlyphKind } from "./TopologyGlyph"
import { TopologyContextMenu, type TopologyMenuEntry } from "./TopologyContextMenu"

/**
 * TopologyDiagram — topology canvas. Positions are stored in VisualRender while
 * the device/connection form remains the authoritative topology model.
 *
 * Form values are the source of truth. Automatic positions follow the network
 * reading order (uplinks → forwarding devices → containers); editor positions
 * override them. No external graph library or second topology model.
 */

type NodeKind = "device" | "forwarding" | "vpn" | "internet"
type DiagramNode = { key: string; label: string; kind: NodeKind; icon?: TopologyIconKey }
type DiagramEdge = { key: string; index: number; a: string; b: string; labelA: string; labelB: string }
type Point = { x: number; y: number }
type DiagramHint = { text: string; left: number; top: number; below: boolean }
type AddNodeKind = "container" | "unmanaged-switch" | "hub" | "vpn" | "internet"
type Context = ({ kind: "node"; key: string } | { kind: "edge"; index: number } | { kind: "canvas"; position: Point })
  & { x: number; y: number; trigger: HTMLElement | SVGElement | null }

const DEFAULT_SIZE = { width: 960, height: 560 }
const ICON_SIZE = 56
const GLYPH_SIZE = 38
const GLYPH_UNIT = GLYPH_SIZE / 24
const GLYPH_BOUNDS: Record<TopologyGlyphKind, { halfX: number; halfY: number; radius?: number }> = {
  host: { halfX: 8 * GLYPH_UNIT, halfY: 10 * GLYPH_UNIT },
  switch: { halfX: 10 * GLYPH_UNIT, halfY: 10 * GLYPH_UNIT },
  "switch-l3": { halfX: 10 * GLYPH_UNIT, halfY: 10 * GLYPH_UNIT },
  hub: { halfX: 10 * GLYPH_UNIT, halfY: 8 * GLYPH_UNIT },
  router: { halfX: 10 * GLYPH_UNIT, halfY: 10 * GLYPH_UNIT, radius: 10 * GLYPH_UNIT },
  firewall: { halfX: 9 * GLYPH_UNIT, halfY: 10.5 * GLYPH_UNIT },
  vpn: { halfX: 8.75 * GLYPH_UNIT, halfY: 10.75 * GLYPH_UNIT },
  internet: { halfX: 9.75 * GLYPH_UNIT, halfY: 9.75 * GLYPH_UNIT, radius: 9.75 * GLYPH_UNIT },
}
const LABEL_GAP = 17
const PORT_LABEL_DISTANCE = 32
const PORT_LABEL_SIDE_GAP = -9
const MIN_X = 70
const MIN_Y = 48

function isMenuKey(event: { key: string; shiftKey: boolean }): boolean {
  return event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")
}

function clampPoint(point: Point, width: number, height: number): Point {
  return { x: Math.max(MIN_X, Math.min(width - MIN_X, point.x)), y: Math.max(MIN_Y, Math.min(height - MIN_Y, point.y)) }
}

function storedPosition(visual: Record<string, unknown> | null, key: string, width: number, height: number): Point | null {
  const positions = visual?.positions
  if (!positions || typeof positions !== "object" || Array.isArray(positions)) return null
  const candidate = (positions as Record<string, unknown>)[key]
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null
  const { x, y } = candidate as Record<string, unknown>
  return typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y)
    ? { x: x * width, y: y * height } : null
}

function storedLabelOffset(visual: Record<string, unknown> | null, key: string): Point {
  const offsets = visual?.labelOffsets
  if (!offsets || typeof offsets !== "object" || Array.isArray(offsets)) return { x: 0, y: 0 }
  const candidate = (offsets as Record<string, unknown>)[key]
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return { x: 0, y: 0 }
  const { x, y } = candidate as Record<string, unknown>
  return typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y)
    ? { x, y } : { x: 0, y: 0 }
}

function portLabelKey(nodeKey: string, port: string): string {
  return JSON.stringify([nodeKey, port])
}

function storedPortLabelOffset(visual: Record<string, unknown> | null, key: string): Point {
  const offsets = visual?.portLabelOffsets
  if (!offsets || typeof offsets !== "object" || Array.isArray(offsets)) return { x: 0, y: 0 }
  const candidate = (offsets as Record<string, unknown>)[key]
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return { x: 0, y: 0 }
  const { x, y } = candidate as Record<string, unknown>
  return typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y)
    ? { x, y } : { x: 0, y: 0 }
}

function rowGeometry(nodes: DiagramNode[], width: number) {
  const hasGateway = nodes.some((node) => node.kind === "vpn" || node.kind === "internet")
  const forwardingRows = Math.ceil(nodes.filter((node) => node.kind === "forwarding").length / 4)
  const containerColumns = width < 800 ? 4 : 5
  const containerRows = Math.ceil(nodes.filter((node) => node.kind === "device").length / containerColumns)
  const forwardingStart = hasGateway ? 260 : 120
  const containerStart = forwardingRows ? forwardingStart + (forwardingRows - 1) * 105 + 155 : hasGateway ? 260 : 120
  return { forwardingRows, containerRows, containerColumns, forwardingStart, containerStart }
}

function layout(nodes: DiagramNode[], visual: Record<string, unknown> | null, width: number, height: number): Map<string, Point> {
  const pos = new Map<string, Point>()
  const gateways = nodes.filter((node) => node.kind === "vpn" || node.kind === "internet")
  const forwarding = nodes.filter((node) => node.kind === "forwarding")
  const containers = nodes.filter((node) => node.kind === "device")
  const { containerColumns, forwardingStart, containerStart } = rowGeometry(nodes, width)
  const place = (group: DiagramNode[], y: number, rowSize = 5) => group.forEach((node, index) => {
    const row = Math.floor(index / rowSize)
    const count = Math.min(rowSize, group.length - row * rowSize)
    const column = index % rowSize
    const x = ((column + 1) * width) / (count + 1)
    pos.set(node.key, storedPosition(visual, node.key, width, height) ?? clampPoint({ x, y: y + row * 105 }, width, height))
  })
  place(gateways, 105, 2)
  place(forwarding, forwardingStart, 4)
  place(containers, containerStart, containerColumns)
  return pos
}

function minimumCanvasHeight(nodes: DiagramNode[], width: number): number {
  const { forwardingRows, containerRows, forwardingStart, containerStart } = rowGeometry(nodes, width)
  const lastRowY = containerRows ? containerStart + (containerRows - 1) * 105
    : forwardingRows ? forwardingStart + (forwardingRows - 1) * 105 : 105
  return Math.max(DEFAULT_SIZE.height, lastRowY + 100)
}

function glyphForNode(node: DiagramNode | undefined): TopologyGlyphKind {
  return node?.kind === "vpn" || node?.kind === "internet" ? node.kind : node?.icon ?? "host"
}

function edgePort(from: Point, to: Point, glyph: TopologyGlyphKind): Point {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (!dx && !dy) return from
  const bounds = GLYPH_BOUNDS[glyph]
  const scale = bounds.radius
    ? bounds.radius / Math.hypot(dx, dy)
    : Math.min(bounds.halfX / (Math.abs(dx) || 1), bounds.halfY / (Math.abs(dy) || 1))
  return { x: Number((from.x + dx * scale).toFixed(2)), y: Number((from.y + dy * scale).toFixed(2)) }
}

function portLabelAxis(own: Point, other: Point): Point {
  const dx = other.x - own.x
  const dy = other.y - own.y
  const length = Math.hypot(dx, dy)
  return length ? { x: dx / length, y: dy / length } : { x: 1, y: 0 }
}

function portLabelPosition(own: Point, other: Point, offset: Point): Point {
  const axis = portLabelAxis(own, other)
  const normal = { x: -axis.y, y: axis.x }
  const along = PORT_LABEL_DISTANCE + offset.x
  const aside = PORT_LABEL_SIDE_GAP + offset.y
  return { x: own.x + axis.x * along + normal.x * aside,
    y: own.y + axis.y * along + normal.y * aside }
}

export function TopologyDiagram({ topology, onPositionChange, onNodeSelect, onNodeSettings, onNodeLinkStart, onNodeRemove,
  onCanvasAddNode, onCanvasLinkStart, onCanvasSelect, onEdgeSelect, onEdgeSettings, onEdgeRemove, linkUnavailableReason = null, onLabelOffsetChange, onPortLabelOffsetChange, onNodeRename, onNodeRenameStart, selectedNodes = [], selectedConnectionIndex = null,
  unavailableConnectionNodes = [], connectionMode = false }: {
  topology: TopologyFormValues
  onPositionChange?: (key: string, position: Point) => void
  onLabelOffsetChange?: (key: string, offset: Point) => void
  onPortLabelOffsetChange?: (key: string, offset: Point) => void
  onNodeRename?: (key: string, name: string) => string | null
  onNodeRenameStart?: () => void
  onNodeSelect?: (key: string) => void
  onNodeSettings?: (key: string) => void
  onNodeLinkStart?: (key: string) => void
  onNodeRemove?: (key: string) => void
  onCanvasAddNode?: (kind: AddNodeKind, position: Point) => void
  onCanvasLinkStart?: () => void
  onCanvasSelect?: () => void
  onEdgeSelect?: (index: number) => void
  onEdgeSettings?: (index: number) => void
  onEdgeRemove?: (index: number) => void
  /** Why a new connection cannot start now (fewer than two nodes with free ports); null when it can. */
  linkUnavailableReason?: string | null
  selectedNodes?: string[]
  selectedConnectionIndex?: number | null
  unavailableConnectionNodes?: string[]
  connectionMode?: boolean
}) {
  const [drag, setDrag] = useState<
    | { kind: "node"; key: string; point: Point; start: Point; moved: boolean }
    | { kind: "label"; key: string; offset: Point; initial: Point; start: Point; moved: boolean }
    | { kind: "port-label"; key: string; offset: Point; initial: Point; start: Point; axis: Point; moved: boolean }
    | null
  >(null)
  const [editingLabel, setEditingLabel] = useState<{ key: string; draft: string; error: string } | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const [context, setContext] = useState<Context | null>(null)
  const [hint, setHint] = useState<DiagramHint | null>(null)
  const [size, setSize] = useState(DEFAULT_SIZE)
  const [measured, setMeasured] = useState(false)
  const [viewport, setViewport] = useState<TopologyViewport>(TOPOLOGY_VIEWPORT_DEFAULT)
  const viewportTouched = useRef(false)
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false)
  const [zoomDraft, setZoomDraft] = useState("100")
  const [pan, setPan] = useState<{ start: Point; initial: TopologyViewport; moved: boolean; captured: boolean } | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const spaceHeld = useRef(false)
  const pointerInside = useRef(false)
  const W = Math.max(size.width, 680)
  const ignoreClick = useRef(false)
  const clipPrefix = useId().replaceAll(":", "")
  const editingLabelKey = editingLabel?.key
  useEffect(() => {
    if (!editingLabelKey) return
    renameInputRef.current?.focus()
    renameInputRef.current?.select()
  }, [editingLabelKey])

  function beginNodeRename(node: DiagramNode) {
    if (!onNodeRename) return
    onNodeRenameStart?.()
    setHint(null)
    setEditingLabel({ key: node.key, draft: node.label, error: "" })
  }

  function commitNodeRename() {
    if (!editingLabel || !onNodeRename) return
    const error = onNodeRename(editingLabel.key, editingLabel.draft)
    if (error) setEditingLabel({ ...editingLabel, error })
    else setEditingLabel(null)
  }
  useLayoutEffect(() => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (rect && rect.width > 0 && rect.height > 0) {
      setSize({ width: Math.round(rect.width), height: Math.round(rect.height) })
      setMeasured(true)
    }
  }, [])
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const width = Math.round(entry.contentRect.width)
      const height = Math.round(entry.contentRect.height)
      if (width > 0 && height > 0) {
        setSize((previous) => previous.width === width && previous.height === height ? previous : { width, height })
        setMeasured(true)
      }
    })
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const onDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" && event.key !== " ") return
      const target = event.target as HTMLElement | null
      if (target?.isContentEditable || target?.matches?.("input, textarea, select, button")) return
      spaceHeld.current = true
      if (pointerInside.current) event.preventDefault()
    }
    const onUp = (event: KeyboardEvent) => {
      if (event.code === "Space" || event.key === " ") spaceHeld.current = false
    }
    const onBlur = () => { spaceHeld.current = false }
    document.addEventListener("keydown", onDown)
    document.addEventListener("keyup", onUp)
    window.addEventListener("blur", onBlur)
    return () => {
      document.removeEventListener("keydown", onDown)
      document.removeEventListener("keyup", onUp)
      window.removeEventListener("blur", onBlur)
    }
  }, [])
  const closeContext = useCallback(() => setContext(null), [])
  const { nodes, edges } = useMemo(() => {
    const nodes: DiagramNode[] = topology.Devices.map((d, index) => ({
      key: d.ID,
      label: d.Name || `${t("admin.exTopo.unnamedDevice")} ${index + 1}`,
      kind: d.Type === "unmanaged-switch" || d.Type === "hub" ? "forwarding" : "device",
      icon: topologyIconFor(d, topology.VisualRender),
    }))
    if (topology.VPN.Enabled) nodes.push({ key: "vpn", label: gatewayLabelFor(topology.VisualRender, "vpn", t("admin.exTopo.vpn")), kind: "vpn" })
    if (topology.Internet.Enabled) nodes.push({ key: "internet", label: gatewayLabelFor(topology.VisualRender, "internet", t("admin.exTopo.internet")), kind: "internet" })

    const known = new Set(nodes.map((n) => n.key))
    const edges: DiagramEdge[] = []
    topology.Connections.forEach((c, i) => {
      const [a, b] = c.Endpoints
      if (!a || !b) return
      const keyA = a.Kind === "device" ? a.DeviceID : a.Kind
      const keyB = b.Kind === "device" ? b.DeviceID : b.Kind
      if (!known.has(keyA) || !known.has(keyB)) return // unresolvable endpoint — skip
      edges.push({ key: `e${i}`, index: i, a: keyA, b: keyB, labelA: a.Interface, labelB: b.Interface })
    })
    return { nodes, edges }
  }, [topology])

  const H = Math.max(size.height, minimumCanvasHeight(nodes, W))
  const pos = useMemo(() => layout(nodes, topology.VisualRender, W, H), [nodes, topology.VisualRender, W, H])
  const nodeByKey = useMemo(() => new Map(nodes.map((node) => [node.key, node])), [nodes])
  if (drag?.kind === "node") pos.set(drag.key, drag.point)

  const fitContentPoints = useCallback((): Point[] => {
    const bounds: Point[] = []
    const addBox = (x: number, y: number, halfWidth: number, halfHeight: number) => {
      bounds.push({ x: x - halfWidth, y: y - halfHeight }, { x: x + halfWidth, y: y + halfHeight })
    }
    for (const node of nodes) {
      const point = pos.get(node.key)!
      const glyph = GLYPH_BOUNDS[glyphForNode(node)]
      addBox(point.x, point.y, glyph.halfX + 4, glyph.halfY + 4)
      const offset = storedLabelOffset(topology.VisualRender, node.key)
      const labelX = point.x + offset.x
      const labelY = point.y + ICON_SIZE / 2 + LABEL_GAP + offset.y
      addBox(labelX, labelY - 5, Math.max(16, Math.min(node.label.length, 20) * 3.8 + 3), 11)
    }
    for (const edge of edges) {
      const a = pos.get(edge.a)!
      const b = pos.get(edge.b)!
      const start = edgePort(a, b, glyphForNode(nodeByKey.get(edge.a)))
      const end = edgePort(b, a, glyphForNode(nodeByKey.get(edge.b)))
      for (const [port, nodeKey, own, other] of [[edge.labelA, edge.a, start, end], [edge.labelB, edge.b, end, start]] as const) {
        if (!port) continue
        const key = portLabelKey(nodeKey, port)
        const offset = storedPortLabelOffset(topology.VisualRender, key)
        const text = shortForwardingPort(port)
        const label = portLabelPosition(own, other, offset)
        addBox(label.x, label.y, Math.max(12, text.length * 3.2 + 3), 10)
      }
    }
    return bounds
  }, [nodes, pos, edges, nodeByKey, topology.VisualRender])

  useLayoutEffect(() => {
    if (!measured || viewportTouched.current) return
    setViewport(initialTopologyViewport(fitContentPoints(), Math.min(W, size.width), Math.min(H, size.height)))
  }, [measured, size.width, size.height, W, H, fitContentPoints])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      viewportTouched.current = true
      const rect = svg.getBoundingClientRect()
      const anchor = { x: ((event.clientX - rect.left) / (rect.width || W)) * W,
        y: ((event.clientY - rect.top) / (rect.height || H)) * H }
      setViewport((current) => zoomViewportAt(current, current.scale * Math.exp(-event.deltaY * 0.0015), anchor))
    }
    svg.addEventListener("wheel", onWheel, { passive: false })
    return () => svg.removeEventListener("wheel", onWheel)
  }, [W, H])

  function canvasPoint(clientX: number, clientY: number, svg: SVGSVGElement): Point {
    const rect = svg.getBoundingClientRect()
    return { x: ((clientX - rect.left) / (rect.width || W)) * W,
      y: ((clientY - rect.top) / (rect.height || H)) * H }
  }

  function pointerPoint(event: PointerEvent<SVGSVGElement>): Point {
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return drag?.kind === "node" ? drag.point : { x: W / 2, y: H / 2 }
    return pointInWorld(canvasPoint(event.clientX, event.clientY, event.currentTarget), viewport)
  }

  function beginPan(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return
    setHint(null)
    setPan({ start: { x: event.clientX, y: event.clientY }, initial: viewport, moved: false, captured: false })
  }

  function setZoomPercent(percent: number) {
    if (!Number.isFinite(percent) || percent <= 0) return
    viewportTouched.current = true
    const anchor = { x: Math.min(W, size.width) / 2, y: Math.min(H, size.height) / 2 }
    setViewport((current) => zoomViewportAt(current, percent / 100, anchor))
    setZoomMenuOpen(false)
  }

  function suppressDragClick() {
    ignoreClick.current = true
    setTimeout(() => { ignoreClick.current = false }, 0)
  }

  function commitPosition(key: string, point: Point) {
    onPositionChange?.(key, { x: Number((point.x / W).toFixed(4)), y: Number((point.y / H).toFixed(4)) })
  }

  function commitLabelOffset(key: string, offset: Point) {
    onLabelOffsetChange?.(key, { x: Number(offset.x.toFixed(4)), y: Number(offset.y.toFixed(4)) })
  }

  function commitPortLabelOffset(key: string, offset: Point) {
    onPortLabelOffsetChange?.(key, { x: Number(offset.x.toFixed(4)), y: Number(offset.y.toFixed(4)) })
  }

  function contextEntries(menu: Context): TopologyMenuEntry[] {
    if (menu.kind === "node") {
      const noPort = unavailableConnectionNodes.includes(menu.key)
      return [
        ...(onNodeSettings ? [{ kind: "item", key: "settings", label: t("admin.exTopo.configure"), icon: <Settings2 className="h-5 w-5 shrink-0 p-0.5" />, onSelect: () => onNodeSettings(menu.key) }] as const : []),
        ...(onNodeLinkStart ? [{ kind: "item", key: "link", label: t("admin.exTopo.addConnection"), icon: <Cable className="h-5 w-5 shrink-0 p-0.5" />,
          disabled: noPort || !!linkUnavailableReason, reason: noPort ? t("admin.exTopo.noFreePort") : linkUnavailableReason ?? undefined,
          onSelect: () => onNodeLinkStart(menu.key) }] as const : []),
        ...(onNodeRemove ? [{ kind: "item", key: "remove", label: t("admin.exTopo.removeDevice"), icon: <Trash2 className="h-5 w-5 shrink-0 p-0.5" />, danger: true, separated: !!(onNodeSettings || onNodeLinkStart),
          onSelect: () => onNodeRemove(menu.key) }] as const : []),
      ]
    }
    if (menu.kind === "edge") {
      return [
        ...(onEdgeSettings ? [{ kind: "item", key: "settings", label: t("admin.exTopo.configure"), icon: <Settings2 className="h-5 w-5 shrink-0 p-0.5" />, onSelect: () => onEdgeSettings(menu.index) }] as const : []),
        ...(onEdgeRemove ? [{ kind: "item", key: "remove", label: t("admin.exTopo.removeConnection"), icon: <Trash2 className="h-5 w-5 shrink-0 p-0.5" />, danger: true, separated: !!onEdgeSettings,
          onSelect: () => onEdgeRemove(menu.index) }] as const : []),
      ]
    }
    const addNode = onCanvasAddNode
    return [
      ...(addNode ? [
        { kind: "label", key: "add-label", label: t("admin.exTopo.addDevice") } as const,
        ...(([
          ["container", "admin.exTopo.type.container", "host"], ["unmanaged-switch", "admin.exTopo.type.switch", "switch"],
          ["hub", "admin.exTopo.type.hub", "hub"], ["vpn", "admin.exTopo.vpn", "vpn"], ["internet", "admin.exTopo.internet", "internet"],
        ] as const).map(([kind, label, glyph]) => ({ kind: "item", key: kind, label: t(label),
          icon: <TopologyGlyph kind={glyph} className="h-5 w-5 shrink-0" />,
          disabled: (kind === "vpn" && topology.VPN.Enabled) || (kind === "internet" && topology.Internet.Enabled),
          onSelect: () => addNode(kind, menu.position) }) as const)),
      ] : []),
      ...(onCanvasLinkStart ? [{ kind: "item", key: "link", label: t("admin.exTopo.addConnection"), icon: <Cable className="h-5 w-5 shrink-0 p-0.5" />, separated: !!addNode,
        disabled: !!linkUnavailableReason, reason: linkUnavailableReason ?? undefined, onSelect: onCanvasLinkStart }] as const : []),
    ]
  }

  function showHint(element: Element, text: string) {
    const rect = element.getBoundingClientRect()
    const below = rect.top < 56
    setHint({ text, left: Math.max(152, Math.min(window.innerWidth - 152, rect.left + rect.width / 2)),
      top: below ? rect.bottom + 7 : rect.top - 7, below })
  }

  return (
    <div className="relative h-full min-w-0 bg-background">
    <div ref={viewportRef} className="h-full min-w-0 overflow-auto">
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={t("admin.exTopo.diagram")}
      className={`block h-full w-full min-w-[680px] ${pan ? "cursor-grabbing" : "cursor-grab"}`}
      style={{ minHeight: H }}
      onPointerEnter={() => { pointerInside.current = true }}
      onPointerLeave={() => { pointerInside.current = false }}
      onPointerDownCapture={(event) => {
        if (!spaceHeld.current || event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()
        beginPan(event)
      }}
      onPointerDown={(event) => {
        if ((event.target as Element).hasAttribute("data-canvas-background")) beginPan(event)
      }}
      onClickCapture={(event) => {
        if (!ignoreClick.current) return
        event.stopPropagation()
        ignoreClick.current = false
      }}
      onContextMenu={(event) => {
        if (!onCanvasAddNode && !onCanvasLinkStart) return
        event.preventDefault()
        const position = pointInWorld(canvasPoint(event.clientX, event.clientY, event.currentTarget), viewport)
        setHint(null)
        setContext({ kind: "canvas", x: event.clientX, y: event.clientY, trigger: null,
          position: { x: Number((position.x / W).toFixed(4)), y: Number((position.y / H).toFixed(4)) } })
      }}
      onPointerMove={(event) => {
        if (pan) {
          const dx = event.clientX - pan.start.x
          const dy = event.clientY - pan.start.y
          if (!pan.moved && Math.hypot(dx, dy) < 5) return
          viewportTouched.current = true
          const rect = event.currentTarget.getBoundingClientRect()
          setViewport({ ...pan.initial, tx: pan.initial.tx + dx * W / (rect.width || W),
            ty: pan.initial.ty + dy * H / (rect.height || H) })
          if (!pan.captured) event.currentTarget.setPointerCapture?.(event.pointerId)
          setPan({ ...pan, moved: true, captured: true })
          return
        }
        if (!drag) return
        if (!drag.moved && Math.hypot(event.clientX - drag.start.x, event.clientY - drag.start.y) < 5) return
        viewportTouched.current = true
        if (drag.kind === "node") setDrag({ ...drag, point: pointerPoint(event), moved: true })
        else {
          const rect = event.currentTarget.getBoundingClientRect()
          const dx = (event.clientX - drag.start.x) * W / (rect.width || W) / viewport.scale
          const dy = (event.clientY - drag.start.y) * H / (rect.height || H) / viewport.scale
          setDrag({ ...drag, offset: drag.kind === "label"
            ? { x: drag.initial.x + dx, y: drag.initial.y + dy }
            : { x: drag.initial.x + dx * drag.axis.x + dy * drag.axis.y,
              y: drag.initial.y - dx * drag.axis.y + dy * drag.axis.x }, moved: true })
        }
      }}
      onPointerUp={() => {
        if (pan) {
          if (pan.moved) suppressDragClick()
          setPan(null)
          return
        }
        if (drag?.moved) {
          // A drag may not produce a click on every browser. Never swallow a
          // later, intentional selection if the synthetic click is absent.
          suppressDragClick()
          if (drag.kind === "node") commitPosition(drag.key, drag.point)
          else if (drag.kind === "label") commitLabelOffset(drag.key, drag.offset)
          else commitPortLabelOffset(drag.key, drag.offset)
        }
        setDrag(null)
      }}
      onPointerCancel={() => { setPan(null); setDrag(null) }}
    >
      <defs>
        <pattern id={`${clipPrefix}-grid`} width="10" height="10" patternUnits="userSpaceOnUse"
          patternTransform={`translate(${viewport.tx} ${viewport.ty}) scale(${viewport.scale})`}><circle cx="1" cy="1" r="0.9" className="fill-muted-foreground/30" /></pattern>
      </defs>
      <rect data-canvas-background width={W} height={H} fill={`url(#${clipPrefix}-grid)`} onClick={onCanvasSelect} />
      <g data-viewport-content transform={`translate(${viewport.tx} ${viewport.ty}) scale(${viewport.scale})`}>
      {/* Edges — drawn under the nodes */}
      {edges.map((edge) => {
        const nameA = nodeByKey.get(edge.a)?.label ?? edge.a
        const nameB = nodeByKey.get(edge.b)?.label ?? edge.b
        const pa = pos.get(edge.a)!
        const pb = pos.get(edge.b)!
        const start = edgePort(pa, pb, glyphForNode(nodeByKey.get(edge.a)))
        const end = edgePort(pb, pa, glyphForNode(nodeByKey.get(edge.b)))
        const portLabelClass = edges.length > 4 && selectedConnectionIndex !== edge.index
          ? "fill-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
          : "fill-foreground"
        const renderPortLabel = (port: string, nodeKey: string, own: Point, other: Point) => {
          if (!port) return null
          const key = portLabelKey(nodeKey, port)
          const offset = drag?.kind === "port-label" && drag.key === key
            ? drag.offset : storedPortLabelOffset(topology.VisualRender, key)
          const label = portLabelPosition(own, other, offset)
          return <text data-port-label data-port-label-key={key}
            x={label.x}
            y={label.y}
            className={`${portLabelClass} select-none ${pan || (drag?.kind === "port-label" && drag.key === key) ? "cursor-grabbing" : onPortLabelOffsetChange ? "cursor-grab touch-none" : ""}`}
            style={{ userSelect: "none" }} fontSize={10} textAnchor="middle"
            paintOrder="stroke" stroke="var(--background)" strokeWidth={3}
            role={onPortLabelOffsetChange ? "button" : undefined} tabIndex={onPortLabelOffsetChange ? 0 : undefined}
            aria-label={onPortLabelOffsetChange ? `${t("admin.exTopo.movePortLabel")}: ${shortForwardingPort(port)}` : undefined}
            onPointerDown={(event) => {
              if (!onPortLabelOffsetChange || event.button !== 0) return
              event.preventDefault()
              event.stopPropagation()
              setHint(null)
              const initial = storedPortLabelOffset(topology.VisualRender, key)
              setDrag({ kind: "port-label", key, initial, offset: initial, axis: portLabelAxis(own, other),
                start: { x: event.clientX, y: event.clientY }, moved: false })
              event.currentTarget.setPointerCapture?.(event.pointerId)
            }}
            onKeyDown={(event) => {
              if (!onPortLabelOffsetChange) return
              const delta = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] }[event.key]
              if (!delta) return
              event.preventDefault()
              event.stopPropagation()
              const axis = portLabelAxis(own, other)
              commitPortLabelOffset(key, { x: offset.x + delta[0] * axis.x + delta[1] * axis.y,
                y: offset.y - delta[0] * axis.y + delta[1] * axis.x })
            }}>{shortForwardingPort(port)}</text>
        }
        return (
          <g key={edge.key} role={onEdgeSelect ? "button" : undefined} tabIndex={onEdgeSelect ? 0 : undefined}
            aria-label={onEdgeSelect ? `${nameA} — ${nameB}` : undefined}
            onClick={() => onEdgeSelect?.(edge.index)}
            onMouseEnter={(event) => showHint(event.currentTarget, `${nameA}: ${edge.labelA || "—"} — ${nameB}: ${edge.labelB || "—"}`)}
            onMouseLeave={() => setHint(null)}
            onFocus={(event) => showHint(event.currentTarget, `${nameA}: ${edge.labelA || "—"} — ${nameB}: ${edge.labelB || "—"}`)}
            onBlur={() => setHint(null)}
            onContextMenu={(event) => {
              if (!onEdgeSettings && !onEdgeRemove) return
              event.preventDefault()
              event.stopPropagation()
              setHint(null)
              onEdgeSelect?.(edge.index)
              setContext({ kind: "edge", index: edge.index, x: event.clientX, y: event.clientY, trigger: event.currentTarget })
            }}
            onKeyDown={(event) => {
              if ((onEdgeSettings || onEdgeRemove) && isMenuKey(event)) {
                event.preventDefault()
                setHint(null)
                const rect = event.currentTarget.getBoundingClientRect()
                setContext({ kind: "edge", index: edge.index, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, trigger: event.currentTarget })
                return
              }
              if (onEdgeRemove && (event.key === "Delete" || event.key === "Backspace")) { event.preventDefault(); onEdgeRemove(edge.index); return }
              if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onEdgeSelect?.(edge.index) }
            }}
            className={onEdgeSelect ? "group cursor-pointer focus:outline-none" : undefined}>
            {onEdgeSelect && <path data-edge-hit={edge.key} d={`M ${start.x} ${start.y} L ${end.x} ${end.y}`}
              fill="none" stroke="transparent" strokeWidth={16} pointerEvents="stroke" />}
            <path data-edge={edge.key} d={`M ${start.x} ${start.y} L ${end.x} ${end.y}`}
              className={selectedConnectionIndex === edge.index ? "fill-none stroke-primary" : "fill-none stroke-muted-foreground/70 group-hover:stroke-primary"}
              strokeWidth={selectedConnectionIndex === edge.index ? 3 : 2} />
            {renderPortLabel(edge.labelA, edge.a, start, end)}
            {renderPortLabel(edge.labelB, edge.b, end, start)}
          </g>
        )
      })}

      {/* Nodes */}
      {nodes.map((node) => {
        const p = pos.get(node.key)!
        const glyph = glyphForNode(node)
        const glyphBounds = GLYPH_BOUNDS[glyph]
        const offset = drag?.kind === "label" && drag.key === node.key
          ? drag.offset : storedLabelOffset(topology.VisualRender, node.key)
        const labelX = p.x + offset.x
        const labelY = p.y + ICON_SIZE / 2 + LABEL_GAP + offset.y
        return (
          <g key={node.key} data-testid={`node-${node.key}`}
            role={onPositionChange || onNodeSelect ? "button" : undefined}
            aria-label={onPositionChange || onNodeSelect ? node.label : undefined}
            aria-disabled={connectionMode && unavailableConnectionNodes.includes(node.key) ? true : undefined}
            aria-description={connectionMode && unavailableConnectionNodes.includes(node.key) ? t("admin.exTopo.noFreePort") : undefined}
            tabIndex={onPositionChange || onNodeSelect ? 0 : undefined}
            className={`group focus:outline-none ${pan || (drag?.kind === "node" && drag.key === node.key) ? "cursor-grabbing" : connectionMode && unavailableConnectionNodes.includes(node.key) ? "opacity-45 cursor-not-allowed" : onPositionChange ? "cursor-grab touch-none" : onNodeSelect || onNodeSettings ? "cursor-pointer" : ""}`}
            onMouseLeave={() => setHint(null)}
            onBlur={() => setHint(null)}
            onPointerDown={(event) => {
              if (!onPositionChange || event.button !== 0) return
              setHint(null)
              const point = pos.get(node.key)!
              setDrag({ kind: "node", key: node.key, point, start: { x: event.clientX, y: event.clientY }, moved: false })
              // Capture on this node, not the SVG root: otherwise the browser
              // retargets the subsequent click to the canvas and selection fails.
              event.currentTarget.setPointerCapture?.(event.pointerId)
            }}
            onClick={() => {
              if (ignoreClick.current) { ignoreClick.current = false; return }
              if (connectionMode && unavailableConnectionNodes.includes(node.key)) return
              onNodeSelect?.(node.key)
            }}
            onContextMenu={(event) => {
              if (!onNodeSettings && !onNodeLinkStart && !onNodeRemove) return
              event.preventDefault()
              event.stopPropagation()
              setHint(null)
              setContext({ kind: "node", key: node.key, x: event.clientX, y: event.clientY, trigger: event.currentTarget })
            }}
            onDoubleClick={() => { setHint(null); onNodeSettings?.(node.key) }}
            onKeyDown={(event) => {
              if ((onNodeSettings || onNodeLinkStart || onNodeRemove) && isMenuKey(event)) {
                event.preventDefault()
                setHint(null)
                const rect = event.currentTarget.getBoundingClientRect()
                setContext({ kind: "node", key: node.key, x: rect.left, y: rect.bottom, trigger: event.currentTarget })
                return
              }
              if (onNodeRemove && (event.key === "Delete" || event.key === "Backspace")) { event.preventDefault(); onNodeRemove(node.key); return }
              if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (!connectionMode || !unavailableConnectionNodes.includes(node.key)) onNodeSelect?.(node.key); return }
              if (!onPositionChange) return
              const delta = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] }[event.key]
              if (!delta) return
              event.preventDefault()
              commitPosition(node.key, { x: p.x + delta[0], y: p.y + delta[1] })
            }}>
            <TopologyGlyph kind={glyph} x={p.x - GLYPH_SIZE / 2} y={p.y - GLYPH_SIZE / 2} width={GLYPH_SIZE} height={GLYPH_SIZE} className="text-foreground" />
            <rect data-icon-hitbox x={p.x - ICON_SIZE / 2} y={p.y - ICON_SIZE / 2} width={ICON_SIZE} height={ICON_SIZE}
              fill="transparent" className="stroke-transparent" />
            {glyphBounds.radius
              ? <circle data-selection-outline cx={p.x} cy={p.y} r={glyphBounds.radius + 2} fill="none" strokeWidth={1.5}
                  pointerEvents="none" className={selectedNodes.includes(node.key) ? "stroke-primary" : "stroke-transparent group-hover:stroke-primary/60 group-focus-visible:stroke-primary"} />
              : <rect data-selection-outline x={p.x - glyphBounds.halfX - 2} y={p.y - glyphBounds.halfY - 2}
                  width={(glyphBounds.halfX + 2) * 2} height={(glyphBounds.halfY + 2) * 2} rx={3} fill="none" strokeWidth={1.5}
                  pointerEvents="none" className={selectedNodes.includes(node.key) ? "stroke-primary" : "stroke-transparent group-hover:stroke-primary/60 group-focus-visible:stroke-primary"} />}
            {editingLabel?.key === node.key ? <foreignObject data-node-rename
              x={Math.max(8, Math.min(W - 248, labelX - 120))} y={labelY - 22} width={240} height={editingLabel.error ? 64 : 40}
              onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}>
              <div className="rounded-md border border-border bg-background p-1">
                <Input ref={renameInputRef} aria-label={t("admin.exTopo.deviceName")} aria-invalid={!!editingLabel.error}
                  value={editingLabel.draft} maxLength={node.kind === "device" ? MAX_DEVICE_NAME_LEN : undefined} className="h-8"
                  onChange={(event) => setEditingLabel({ ...editingLabel, draft: event.target.value, error: "" })}
                  onBlur={commitNodeRename}
                  onKeyDown={(event) => {
                    event.stopPropagation()
                    if (event.key === "Enter") { event.preventDefault(); commitNodeRename() }
                    if (event.key === "Escape") { event.preventDefault(); setEditingLabel(null) }
                  }} />
                {editingLabel.error && <p role="alert" className="text-xs text-destructive">{editingLabel.error}</p>}
              </div>
            </foreignObject> : <g className="group/label"
              onMouseEnter={(event) => { if (!onNodeRename) return; event.stopPropagation(); showHint(event.currentTarget, t("admin.exTopo.renameOnDoubleClick")) }}
              onMouseLeave={() => setHint(null)}
              onFocus={(event) => { if (!onNodeRename) return; event.stopPropagation(); showHint(event.currentTarget, t("admin.exTopo.renameOnDoubleClick")) }}
              onBlur={() => setHint(null)}>
            <text
              data-node-label
              x={labelX}
              y={labelY}
              className={`fill-foreground select-none ${pan || (drag?.kind === "label" && drag.key === node.key) ? "cursor-grabbing" : onLabelOffsetChange ? "cursor-grab touch-none" : ""}`}
              style={{ userSelect: "none" }}
              fontSize={12}
              fontWeight={500}
              textAnchor="middle"
              paintOrder="stroke" stroke="var(--background)" strokeWidth={4}
              role={onLabelOffsetChange || onNodeRename ? "button" : undefined}
              tabIndex={onLabelOffsetChange || onNodeRename ? 0 : undefined}
              aria-label={onLabelOffsetChange ? `${t("admin.exTopo.moveLabel")}: ${node.label}` : undefined}
              aria-description={onNodeRename ? t("admin.exTopo.renameDevice") : undefined}
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); beginNodeRename(node) }}
              onPointerDown={(event) => {
                if (!onLabelOffsetChange || event.button !== 0) return
                event.preventDefault()
                event.stopPropagation()
                setHint(null)
                const initial = storedLabelOffset(topology.VisualRender, node.key)
                setDrag({ kind: "label", key: node.key, initial, offset: initial,
                  start: { x: event.clientX, y: event.clientY }, moved: false })
                event.currentTarget.setPointerCapture?.(event.pointerId)
              }}
              onKeyDown={(event) => {
                if (onNodeRename && (event.key === "Enter" || event.key === "F2")) {
                  event.preventDefault()
                  event.stopPropagation()
                  beginNodeRename(node)
                  return
                }
                if (!onLabelOffsetChange) return
                const delta = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] }[event.key]
                if (!delta) return
                event.preventDefault()
                event.stopPropagation()
                commitLabelOffset(node.key, { x: offset.x + delta[0], y: offset.y + delta[1] })
              }}
            >
              {node.label.length > 20 ? `${node.label.slice(0, 19)}…` : node.label}
            </text>
            {onNodeRename && <Pencil aria-hidden="true" x={labelX + Math.max(16, Math.min(node.label.length, 20) * 3.8 + 3) + 4}
              y={labelY - 12} width={12} height={12}
              className="pointer-events-none text-muted-foreground opacity-0 transition-opacity group-hover/label:opacity-100 group-focus-within/label:opacity-100" />}
            </g>}
          </g>
        )
      })}
      </g>
    </svg>
    </div>
    <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-md border border-border bg-background/95 p-1">
      <HoverTooltip text={t("admin.exTopo.zoomOut")}><Button type="button" variant="ghost" size="icon" className="h-8 w-8"
        aria-label={t("admin.exTopo.zoomOut")} onClick={() => { viewportTouched.current = true; setViewport((current) => zoomViewportAt(current, current.scale / 1.25,
          { x: Math.min(W, size.width) / 2, y: Math.min(H, size.height) / 2 })) }}><ZoomOut className="h-4 w-4" /></Button></HoverTooltip>
      <PopoverPrimitive.Root open={zoomMenuOpen} onOpenChange={(open) => {
        setZoomMenuOpen(open)
        if (open) setZoomDraft(String(Math.round(viewport.scale * 100)))
      }}>
        <PopoverPrimitive.Trigger asChild><Button type="button" variant="ghost" size="sm"
          aria-label={t("admin.exTopo.zoomLevel")} className="h-8 gap-0.5 px-1.5 text-xs tabular-nums">
          {Math.round(viewport.scale * 100)}%<ChevronDown className="h-3 w-3" />
        </Button></PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal><PopoverPrimitive.Content align="center" sideOffset={6}
          className="z-50 w-44 rounded-md border border-border bg-popover p-2">
          <div className="grid grid-cols-2 gap-1">
            {[50, 75, 100, 125, 150, 200, 250].map((percent) => <Button key={percent} type="button" variant="ghost" size="sm"
              className="h-7 justify-start px-2 text-xs tabular-nums" onClick={() => setZoomPercent(percent)}>{percent}%</Button>)}
          </div>
          <form className="mt-2 flex gap-1 border-t border-border pt-2" onSubmit={(event) => { event.preventDefault(); setZoomPercent(Number(zoomDraft)) }}>
            <Input type="number" min={50} max={250} step={1} aria-label={t("admin.exTopo.zoomCustom")}
              value={zoomDraft} onChange={(event) => setZoomDraft(event.target.value)} className="h-8 min-w-0 flex-1 px-2 text-xs" />
            <Button type="submit" size="sm" className="h-8 px-2 text-xs">{t("admin.exTopo.zoomApply")}</Button>
          </form>
        </PopoverPrimitive.Content></PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
      <HoverTooltip text={t("admin.exTopo.zoomIn")}><Button type="button" variant="ghost" size="icon" className="h-8 w-8"
        aria-label={t("admin.exTopo.zoomIn")} onClick={() => { viewportTouched.current = true; setViewport((current) => zoomViewportAt(current, current.scale * 1.25,
          { x: Math.min(W, size.width) / 2, y: Math.min(H, size.height) / 2 })) }}><ZoomIn className="h-4 w-4" /></Button></HoverTooltip>
      <HoverTooltip text={t("admin.exTopo.fitCanvas")}><Button type="button" variant="ghost" size="icon" className="h-8 w-8"
        aria-label={t("admin.exTopo.fitCanvas")} onClick={() => { viewportTouched.current = true; setViewport(fitViewport(fitContentPoints(), Math.min(W, size.width), Math.min(H, size.height))) }}>
        <Maximize className="h-4 w-4" /></Button></HoverTooltip>
    </div>
    {context && <TopologyContextMenu x={context.x} y={context.y} entries={contextEntries(context)} onClose={closeContext}
      returnFocus={context.trigger}
      label={t(context.kind === "node" ? "admin.exTopo.deviceSettings" : context.kind === "edge" ? "admin.exTopo.connectionMenu" : "admin.exTopo.diagram")} />}
    {hint && createPortal(<div role="tooltip" className="pointer-events-none fixed z-[100] max-w-72 whitespace-pre-line rounded-md border border-border bg-popover px-2.5 py-2 text-xs font-normal leading-relaxed text-popover-foreground"
      style={{ left: hint.left, top: hint.top, transform: `translate(-50%, ${hint.below ? "0" : "-100%"})` }}>{hint.text}</div>, document.body)}
    </div>
  )
}
