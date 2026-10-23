import { describe, expect, it } from "vitest"
import { DEFAULT_COLUMNS, isDefaultColumns, moveColumn, normalizeColumns, toggleColumn } from "./catalogColumns"

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
