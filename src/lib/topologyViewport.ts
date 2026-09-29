export type TopologyPoint = { x: number; y: number }
export type TopologyViewport = { scale: number; tx: number; ty: number }

export const TOPOLOGY_VIEWPORT_DEFAULT: TopologyViewport = { scale: 1, tx: 0, ty: 0 }
export const TOPOLOGY_INITIAL_SCALE = 1.25
export const TOPOLOGY_ZOOM_MIN = 0.5
export const TOPOLOGY_ZOOM_MAX = 2.5

export function pointInWorld(point: TopologyPoint, viewport: TopologyViewport): TopologyPoint {
  return { x: (point.x - viewport.tx) / viewport.scale, y: (point.y - viewport.ty) / viewport.scale }
}

export function zoomViewportAt(viewport: TopologyViewport, requestedScale: number, anchor: TopologyPoint): TopologyViewport {
  const scale = Math.max(TOPOLOGY_ZOOM_MIN, Math.min(TOPOLOGY_ZOOM_MAX, requestedScale))
  const world = pointInWorld(anchor, viewport)
  return { scale, tx: anchor.x - world.x * scale, ty: anchor.y - world.y * scale }
}

export function initialTopologyViewport(points: TopologyPoint[], width: number, height: number): TopologyViewport {
  if (width <= 0 || height <= 0) return TOPOLOGY_VIEWPORT_DEFAULT
  if (points.length === 0) return zoomViewportAt(TOPOLOGY_VIEWPORT_DEFAULT, TOPOLOGY_INITIAL_SCALE, { x: width / 2, y: height / 2 })
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const margin = 64
  const scale = Math.min(TOPOLOGY_INITIAL_SCALE,
    Math.max(1, width - margin * 2) / Math.max(1, maxX - minX),
    Math.max(1, height - margin * 2) / Math.max(1, maxY - minY))
  return { scale,
    tx: width / 2 - ((minX + maxX) / 2) * scale,
    ty: height / 2 - ((minY + maxY) / 2) * scale }
}

/** Fit is permitted below the interactive zoom floor when a very dense board needs it. */
export function fitViewport(points: TopologyPoint[], visibleWidth: number, visibleHeight: number): TopologyViewport {
  if (points.length === 0 || visibleWidth <= 0 || visibleHeight <= 0) return TOPOLOGY_VIEWPORT_DEFAULT
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const margin = 64
  const scale = Math.min(TOPOLOGY_ZOOM_MAX,
    Math.max(1, visibleWidth - margin * 2) / Math.max(1, maxX - minX),
    Math.max(1, visibleHeight - margin * 2) / Math.max(1, maxY - minY))
  return {
    scale,
    tx: visibleWidth / 2 - ((minX + maxX) / 2) * scale,
    ty: visibleHeight / 2 - ((minY + maxY) / 2) * scale,
  }
}
