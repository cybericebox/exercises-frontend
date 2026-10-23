import { describe, expect, it } from "vitest"
import { DEFAULT_COLUMNS, MAX_WIDTH, MIN_WIDTH, NAME_COLUMN, NAME_MIN_WIDTH, clampWidth, isDefaultColumns, isDefaultLayout, layoutToStored, moveColumn, normalizeColumns, normalizeLayout, toggleColumn, withLocalWidths, withWidth } from "./catalogColumns"

describe("catalog columns", () => {
  it("shows access, status, subtasks, variants, author and updated by default", () => {
    expect(DEFAULT_COLUMNS.filter((column) => column.visible).map((column) => column.key)).toEqual(["access", "status", "subtasks", "variants", "author", "updated"])
    expect(isDefaultColumns(normalizeColumns(null))).toBe(true)
  })

  it("keeps a stored order, drops unknown and repeated columns and appends new ones with their default", () => {
    const stored = [{ key: "author", visible: true }, { key: "gone", visible: true }, { key: "status", visible: false }, { key: "author", visible: false }]
    const columns = normalizeColumns(stored)
    expect(columns.slice(0, 2)).toEqual([{ key: "author", visible: true }, { key: "status", visible: false }])
    expect(columns.map((column) => column.key)).toHaveLength(DEFAULT_COLUMNS.length)
    expect(columns.find((column) => column.key === "tags")).toEqual({ key: "tags", visible: false })
    expect(normalizeColumns("garbage")).toEqual(DEFAULT_COLUMNS)
  })

  it("moves within bounds and toggles one column without touching the input", () => {
    const moved = moveColumn(DEFAULT_COLUMNS, 0, 2)
    expect(moved.map((column) => column.key).slice(0, 3)).toEqual(["status", "subtasks", "access"])
    expect(moveColumn(DEFAULT_COLUMNS, 0, -5)).toBe(DEFAULT_COLUMNS)
    expect(moveColumn(DEFAULT_COLUMNS, 8, 99)).toBe(DEFAULT_COLUMNS)
    const toggled = toggleColumn(DEFAULT_COLUMNS, "tags")
    expect(toggled.find((column) => column.key === "tags")?.visible).toBe(true)
    expect(DEFAULT_COLUMNS.find((column) => column.key === "tags")?.visible).toBe(false)
    expect(isDefaultColumns(toggled)).toBe(false)
  })
})

describe("column widths", () => {
  it("keeps a stored width inside the column's bounds and treats 0 or garbage as unset", () => {
    const columns = normalizeColumns([{ key: "author", visible: true, width: 10 }, { key: "status", visible: true, width: 5000 }, { key: "access", visible: true, width: 0 }, { key: "tags", visible: false, width: "wide" }])
    expect(columns.slice(0, 4)).toEqual([{ key: "author", visible: true, width: MIN_WIDTH }, { key: "status", visible: true, width: MAX_WIDTH }, { key: "access", visible: true }, { key: "tags", visible: false }])
  })

  it("stores the «Назва» width on a name entry and reads it back", () => {
    const layout = withWidth(withWidth({ columns: DEFAULT_COLUMNS }, NAME_COLUMN, 150), "author", 222)
    expect(layout.nameWidth).toBe(NAME_MIN_WIDTH)
    const stored = layoutToStored(layout)
    expect(stored[0]).toEqual({ key: NAME_COLUMN, visible: true, width: NAME_MIN_WIDTH })
    expect(normalizeLayout(JSON.parse(JSON.stringify(stored)))).toEqual(layout)
    expect(isDefaultLayout(layout)).toBe(false)
    expect(isDefaultLayout(withWidth(withWidth(layout, NAME_COLUMN, undefined), "author", undefined))).toBe(true)
  })

  it("keeps this browser's widths when the profile does not carry them", () => {
    const server = normalizeLayout([{ key: "author", visible: true }, { key: "status", visible: false, width: 150 }])
    const local = normalizeLayout([{ key: NAME_COLUMN, visible: true, width: 300 }, { key: "author", visible: true, width: 240 }, { key: "status", visible: true, width: 99 }])
    const merged = withLocalWidths(server, local)
    expect(merged.nameWidth).toBe(300)
    expect(merged.columns.slice(0, 2)).toEqual([{ key: "author", visible: true, width: 240 }, { key: "status", visible: false, width: 150 }])
    expect(clampWidth("author", 79.6)).toBe(MIN_WIDTH)
  })
})
