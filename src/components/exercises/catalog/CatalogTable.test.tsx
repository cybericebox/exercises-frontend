import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a> }))

import { CatalogTable } from "./CatalogTable"
import { DEFAULT_COLUMNS } from "@/lib/catalogColumns"
import { LIST_EXTRAS, OWNERSHIP } from "@/test/exerciseFixtures"
import type { ExerciseListItem } from "@/api/exercises/catalog"

const LONG = "Розслідування складного багатокрокового інциденту в інфраструктурі регіонального навчального центру кібербезпеки"
const item: ExerciseListItem = {
  ...OWNERSHIP, ...LIST_EXTRAS, ID: "e1", Name: LONG, Description: "", Tags: [], HasDraft: false, HasPublished: true,
  Status: "published", ArchivedAt: null, CreatedAt: "2026-10-01T00:00:00Z", UpdatedAt: "2026-10-01T00:00:00Z",
}

function table(state?: React.ReactNode, rows = [item], onWidth = vi.fn(), columns = DEFAULT_COLUMNS) {
  return render(<CatalogTable rows={rows} columns={columns} selected={new Map()} selecting selectable={() => true} atLimit={false} allOnPage={false} pageSelectable={1}
    onToggle={vi.fn()} onToggleAll={vi.fn()} sortProps={{ activeField: "updated", direction: "desc", onSort: vi.fn() }} eventName={() => undefined}
    regionRef={{ current: null }} busy={false} state={state} onWidth={onWidth} />)
}

describe("CatalogTable", () => {
  it("gives every column but the name a fixed width, so a long name is cut instead of widening the table", () => {
    const { container } = table()
    const cols = [...container.querySelectorAll("col")]
    expect(cols[1].style.width).toBe("")
    expect(cols.filter((col, index) => index !== 1).every((col) => col.style.width.endsWith("px"))).toBe(true)
    const data = container.querySelector("table")!
    expect(data).toHaveClass("catalog-data")
    // The sum of the fixed columns plus the name's minimum: the table scrolls sideways only below that.
    expect(data.style.minWidth).toBe(`${44 + 240 + 190 + 140 + 134 + 112 + 160 + 124}px`)
    // Every column, the name included, has a resize handle.
    expect(screen.getAllByRole("separator")).toHaveLength(7)
    expect(screen.getByRole("link", { name: LONG })).toHaveClass("catalog-task-link")
  })

  it("keeps the same header and fills the block with a state, centred", () => {
    const { container } = table(<p>loading</p>, [])
    expect(container.querySelector("table")).toHaveClass("catalog-data-state")
    expect(container.querySelectorAll("thead th")).toHaveLength(8)
    expect(container.querySelector("tbody.ib-table__state")).toHaveTextContent("loading")
  })

  it("drags a column edge: previews while moving, saves the clamped width once at the end", () => {
    const onWidth = vi.fn()
    const { container } = table(undefined, [item], onWidth)
    const author = screen.getAllByRole("separator").find((node) => node.getAttribute("aria-valuenow") === "160")!
    fireEvent.pointerDown(author, { pointerId: 1, button: 0, clientX: 500 })
    fireEvent.pointerMove(author, { pointerId: 1, clientX: 560 })
    const authorCol = [...container.querySelectorAll("col")][6]
    expect(authorCol.style.width).toBe("220px")
    expect(onWidth).not.toHaveBeenCalled()
    fireEvent.pointerUp(author, { pointerId: 1, clientX: 560 })
    expect(onWidth).toHaveBeenCalledWith("author", 220)
    // The minimum holds.
    fireEvent.pointerDown(author, { pointerId: 2, button: 0, clientX: 500 })
    fireEvent.pointerMove(author, { pointerId: 2, clientX: 0 })
    fireEvent.pointerUp(author, { pointerId: 2, clientX: 0 })
    expect(onWidth).toHaveBeenLastCalledWith("author", 80)
  })

  it("moves an edge with ←/→ and goes back to the default on a double click", () => {
    const onWidth = vi.fn()
    table(undefined, [item], onWidth, DEFAULT_COLUMNS.map((column) => column.key === "status" ? { ...column, width: 200 } : column))
    const status = screen.getAllByRole("separator").find((node) => node.getAttribute("aria-valuenow") === "200")!
    expect(status).toHaveAttribute("tabindex", "0")
    fireEvent.keyDown(status, { key: "ArrowRight" })
    expect(onWidth).toHaveBeenLastCalledWith("status", 216)
    fireEvent.keyDown(status, { key: "ArrowLeft", shiftKey: true })
    expect(onWidth).toHaveBeenLastCalledWith("status", 152)
    fireEvent.doubleClick(status)
    expect(onWidth).toHaveBeenLastCalledWith("status", undefined)
  })

  it("lets «Назва» be resized too, never below its minimum", () => {
    const onWidth = vi.fn()
    table(undefined, [item], onWidth)
    const name = screen.getAllByRole("separator")[0]
    expect(name).toHaveAttribute("aria-valuemin", "200")
    fireEvent.keyDown(name, { key: "ArrowLeft", shiftKey: true })
    expect(onWidth).toHaveBeenLastCalledWith("name", 200)
  })
})
