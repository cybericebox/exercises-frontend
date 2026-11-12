"use client"

import { useEffect, useState, type RefObject } from "react"

import type { DeviceStage } from "@/lib/testLab"

/**
 * THE ONE ADAPTER between the test view and the topology canvas. It stands in for the canvas props package C added
 * (`nodeStatus` and `minPortLabelScale` on TopologyDiagram, feat/editor-c). When they reach the foundation, SchemaView passes
 * them to the diagram and this file is deleted: the inputs are the same (a status per node key, a minimum scale).
 */

/** The same names as `TopologyNodeStatus` of the diagram. */
export type NodeStatus = "pending" | "starting" | "initializing" | "ready" | "failed"

export function nodeStatusOf(stage: DeviceStage): NodeStatus {
  switch (stage.kind) {
    case "ready": return "ready"
    case "failed": case "initFailed": return "failed"
    case "initializing": return "initializing"
    case "starting": return "starting"
    default: return "pending"
  }
}

const COLOR: Record<NodeStatus, string> = { pending: "var(--muted-foreground)", starting: "var(--primary)", initializing: "var(--primary)", ready: "var(--ib-ok)", failed: "var(--ib-warn)" }
// The stage is not told by colour alone: the outline pattern differs too (and the device list says it in words).
const DASH: Record<NodeStatus, string> = { pending: "2 4", starting: "6 3", initializing: "6 3", ready: "none", failed: "1 3" }

/** The permanent outline of every node in the colour and pattern of its stage; the selected one is thicker. */
export function NodeStatusStyle({ statuses, selected }: { statuses: Record<string, NodeStatus>; selected: string | null }) {
  const css = Object.entries(statuses).map(([key, status]) => {
    const node = `[data-lab-schema] [data-testid="node-${CSS.escape(key)}"] [data-selection-outline]`
    return `${node}{stroke:${COLOR[status]};stroke-dasharray:${DASH[status]};stroke-width:${key === selected ? 4 : 2}}`
  }).join("\n")
  return <style>{css}</style>
}

/** The scale in an SVG `transform="translate(..) scale(..)"`. */
export function scaleOf(transform: string | null): number | null {
  const match = /scale\(\s*([-\d.eE]+)/.exec(transform ?? "")
  return match ? Number(match[1]) : null
}

/** True while the view is zoomed out below `minScale`: the port labels are then hidden (CSS on `data-low-scale`). */
export function useBelowScale(root: RefObject<HTMLElement | null>, minScale: number): boolean {
  const [low, setLow] = useState(false)
  useEffect(() => {
    const element = root.current
    if (!element || typeof MutationObserver === "undefined") return
    const read = () => {
      const scale = scaleOf(element.querySelector("[data-viewport-content]")?.getAttribute("transform") ?? null)
      setLow(scale !== null && scale < minScale)
    }
    read()
    const observer = new MutationObserver(read)
    observer.observe(element, { subtree: true, childList: true, attributes: true, attributeFilter: ["transform"] })
    return () => observer.disconnect()
  }, [root, minScale])
  return low
}
