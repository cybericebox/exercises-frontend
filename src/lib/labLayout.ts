/**
 * labLayout.ts — the author's own arrangement of a running lab's topology (dragged devices and
 * labels) and the other view choices of the test lab page. Everything stays in this browser:
 * one map keyed by the deploy id, dropped when the lab ends. Storage may be blocked, so every
 * access is guarded and the page works without it.
 */

export const LAB_LAYOUTS_KEY = "cib_lab_layouts"
export const LAB_SIDEBAR_COLLAPSED_KEY = "cib_lab_sidebar_collapsed"
export const LAB_TOPOLOGY_SHOWN_KEY = "cib_lab_topology_shown"
export const LAB_TOPOLOGY_WIDTH_KEY = "cib_lab_topology_width"

type Point = { x: number; y: number }
type Points = Record<string, Point>

export type LabLayout = { nodes: Points; labels: Points; portLabels: Points }

export const EMPTY_LAYOUT: LabLayout = { nodes: {}, labels: {}, portLabels: {} }

const isPoint = (value: unknown): value is Point =>
  typeof value === "object" && value !== null && Number.isFinite((value as Point).x) && Number.isFinite((value as Point).y)

function points(value: unknown): Points {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, Point] => isPoint(entry[1])).map(([key, p]) => [key, { x: p.x, y: p.y }]))
}

function readMap(): Record<string, LabLayout> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(LAB_LAYOUTS_KEY) ?? "{}")
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).map(([id, layout]) => {
      const raw = (layout ?? {}) as Partial<Record<keyof LabLayout, unknown>>
      return [id, { nodes: points(raw.nodes), labels: points(raw.labels), portLabels: points(raw.portLabels) }]
    }))
  } catch {
    return {}
  }
}

/** The map goes back to storage; an empty map removes the key instead of leaving `{}` behind. */
function writeMap(map: Record<string, LabLayout>) {
  try {
    if (Object.keys(map).length === 0) window.localStorage.removeItem(LAB_LAYOUTS_KEY)
    else window.localStorage.setItem(LAB_LAYOUTS_KEY, JSON.stringify(map))
  } catch { /* the arrangement just lives for this visit */ }
}

export function readLayout(deployId: string): LabLayout {
  return readMap()[deployId] ?? EMPTY_LAYOUT
}

export function saveLayout(deployId: string, layout: LabLayout) {
  writeMap({ ...readMap(), [deployId]: layout })
}

/** A lab that ended (or is gone): forget its arrangement only. */
export function removeLayout(deployId: string) {
  const map = readMap()
  if (!(deployId in map)) return
  delete map[deployId]
  writeMap(map)
}

/** Forget every arrangement whose lab is no longer among the active ones. */
export function pruneLayouts(activeDeployIds: readonly string[]) {
  const map = readMap()
  const stale = Object.keys(map).filter((id) => !activeDeployIds.includes(id))
  if (stale.length === 0) return
  for (const id of stale) delete map[id]
  writeMap(map)
}

/** The variant's own VisualRender with the author's dragged positions laid over it. */
export function withLayout(visual: Record<string, unknown> | null, layout: LabLayout): Record<string, unknown> | null {
  if (!Object.keys(layout.nodes).length && !Object.keys(layout.labels).length && !Object.keys(layout.portLabels).length) return visual
  const base = visual ?? {}
  const merged = (key: string, extra: Points) => ({ ...(typeof base[key] === "object" && base[key] !== null ? base[key] as object : {}), ...extra })
  return { ...base, positions: merged("positions", layout.nodes), labelOffsets: merged("labelOffsets", layout.labels), portLabelOffsets: merged("portLabelOffsets", layout.portLabels) }
}
