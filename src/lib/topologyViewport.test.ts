import { describe, expect, it } from "vitest"
import { fitViewport, initialTopologyViewport, pointInWorld, zoomViewportAt, type TopologyViewport } from "./topologyViewport"

describe("topology viewport geometry", () => {
  it("centers actual content at up to 125 percent with breathing room", () => {
    const viewport = initialTopologyViewport([{ x: 300, y: 50 }, { x: 600, y: 150 }], 960, 560)
    expect(viewport.scale).toBe(1.25)
    expect((450 * viewport.scale + viewport.tx)).toBe(480)
    expect((100 * viewport.scale + viewport.ty)).toBe(280)
    const wide = initialTopologyViewport([{ x: -500, y: 50 }, { x: 1000, y: 150 }], 960, 560)
    expect(wide.scale).toBeLessThan(1.25)
    expect((-500 * wide.scale + wide.tx)).toBeGreaterThanOrEqual(64)
    expect((1000 * wide.scale + wide.tx)).toBeLessThanOrEqual(896)
  })
  it("zooms around the pointer without moving its world point", () => {
    const before: TopologyViewport = { scale: 1, tx: 0, ty: 0 }
    const anchor = { x: 320, y: 180 }
    const after = zoomViewportAt(before, 1.8, anchor)
    expect(after.scale).toBe(1.8)
    expect(pointInWorld(anchor, after)).toEqual(pointInWorld(anchor, before))
  })

  it("bounds interactive zoom from 50 to 250 percent", () => {
    const before: TopologyViewport = { scale: 1, tx: 0, ty: 0 }
    expect(zoomViewportAt(before, 0.01, { x: 0, y: 0 }).scale).toBe(0.5)
    expect(zoomViewportAt(before, 100, { x: 0, y: 0 }).scale).toBe(2.5)
  })

  it("fits all nodes with a margin and resets an empty canvas", () => {
    const viewport = fitViewport([{ x: 100, y: 100 }, { x: 900, y: 900 }], 960, 560)
    const a = { x: 100 * viewport.scale + viewport.tx, y: 100 * viewport.scale + viewport.ty }
    const b = { x: 900 * viewport.scale + viewport.tx, y: 900 * viewport.scale + viewport.ty }
    expect(a.x).toBeGreaterThan(0)
    expect(a.y).toBeGreaterThan(0)
    expect(b.x).toBeLessThan(960)
    expect(b.y).toBeLessThan(560)
    expect(fitViewport([], 960, 560)).toEqual({ scale: 1, tx: 0, ty: 0 })
  })
})
