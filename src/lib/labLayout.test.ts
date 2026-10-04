import { beforeEach, describe, expect, it, vi } from "vitest"
import { LAB_LAYOUTS_KEY, pruneLayouts, readLayout, removeLayout, saveLayout, withLayout } from "./labLayout"

const layout = { nodes: { a: { x: 1, y: 2 } }, labels: {}, portLabels: {} }

describe("labLayout", () => {
  beforeEach(() => window.localStorage.clear())

  it("keeps one map keyed by deploy and forgets a bad stored value", () => {
    saveLayout("d1", layout)
    saveLayout("d2", layout)
    expect(Object.keys(JSON.parse(window.localStorage.getItem(LAB_LAYOUTS_KEY)!))).toEqual(["d1", "d2"])
    expect(readLayout("d1")).toEqual(layout)
    window.localStorage.setItem(LAB_LAYOUTS_KEY, "{not json")
    expect(readLayout("d1").nodes).toEqual({})
  })

  it("removes the key with the last entry, and prunes the labs that are gone", () => {
    saveLayout("d1", layout)
    saveLayout("d2", layout)
    pruneLayouts(["d2"])
    expect(Object.keys(JSON.parse(window.localStorage.getItem(LAB_LAYOUTS_KEY)!))).toEqual(["d2"])
    removeLayout("d2")
    expect(window.localStorage.getItem(LAB_LAYOUTS_KEY)).toBeNull()
  })

  it("never throws when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked") })
    expect(() => saveLayout("d1", layout)).not.toThrow()
    vi.restoreAllMocks()
  })

  it("lays the positions over the variant's own", () => {
    expect(withLayout({ positions: { a: { x: 0, y: 0 }, b: { x: 5, y: 5 } }, icons: 1 }, layout)).toEqual({
      icons: 1, positions: { a: { x: 1, y: 2 }, b: { x: 5, y: 5 } }, labelOffsets: {}, portLabelOffsets: {} })
    expect(withLayout(null, { nodes: {}, labels: {}, portLabels: {} })).toBeNull()
  })
})
