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

function table(state?: React.ReactNode, rows = [item], onWidth = vi.fn(), columns = DEFAULT_COLUMNS, nameWidth?: number) {
  return render(<CatalogTable rows={rows} columns={columns} nameWidth={nameWidth} selected={new Map()} selecting selectable={() => true} atLimit={false} allOnPage={false} pageSelectable={1}
    onToggle={vi.fn()} onToggleAll={vi.fn()} sortProps={{ activeField: "updated", direction: "desc", onSort: vi.fn() }} eventName={() => undefined}
    regionRef={{ current: null }} busy={false} state={state} onWidth={onWidth} />)
}

describe("CatalogTable", () => {
  it("gives every column, the name too, its own width; an empty filler at the end takes the rest", () => {
    const { container } = table()
    const cols = [...container.querySelectorAll("col")]
    expect(cols.slice(0, -1).map((col) => col.style.width)).toEqual(["44px", "268px", "190px", "128px", "134px", "112px", "150px", "124px"])
    expect(cols.at(-1)).toHaveAttribute("data-catalog-filler")
    expect(cols.at(-1)!.style.width).toBe("")
    expect(container.querySelector("thead .catalog-filler")).toHaveAttribute("aria-hidden", "true")
    expect(container.querySelector("tbody .catalog-filler")).toBeEmptyDOMElement()
    const data = container.querySelector("table")!
    expect(data).toHaveClass("catalog-data")
    // The sum of the columns (filling a 1440px screen's table block); the table scrolls sideways only below that.
    expect(data.style.minWidth).toBe(`${44 + 268 + 190 + 128 + 134 + 112 + 150 + 124}px`)
    // Every column, the name included, has a resize handle.
    expect(screen.getAllByRole("separator")).toHaveLength(7)
    expect(screen.getByRole("link", { name: LONG })).toHaveClass("catalog-task-link")
  })

  it("keeps the same header and fills the block with a state, centred", () => {
    const { container } = table(<p>loading</p>, [])
    expect(container.querySelector("table")).toHaveClass("catalog-data-state")
    expect(container.querySelectorAll("thead th")).toHaveLength(8)
    expect(container.querySelector("thead .catalog-filler")).toBeInTheDocument()
    expect(container.querySelector("tbody.ib-table__state")).toHaveTextContent("loading")
  })

  it("drags a column edge: previews while moving, saves the clamped width once at the end", () => {
    const onWidth = vi.fn()
    const { container } = table(undefined, [item], onWidth)
    const author = screen.getAllByRole("separator").find((node) => node.getAttribute("aria-valuenow") === "150")!
    fireEvent.pointerDown(author, { pointerId: 1, button: 0, clientX: 500 })
    fireEvent.pointerMove(author, { pointerId: 1, clientX: 560 })
    const authorCol = [...container.querySelectorAll("col")][6]
    expect(authorCol.style.width).toBe("210px")
    expect(onWidth).not.toHaveBeenCalled()
    fireEvent.pointerUp(author, { pointerId: 1, clientX: 560 })
    expect(onWidth).toHaveBeenCalledWith("author", 210)
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
    expect(onWidth).toHaveBeenLastCalledWith("name", 220)
    fireEvent.pointerDown(name, { pointerId: 1, button: 0, clientX: 500 })
    fireEvent.pointerMove(name, { pointerId: 1, clientX: 0 })
    fireEvent.pointerUp(name, { pointerId: 1, clientX: 0 })
    expect(onWidth).toHaveBeenLastCalledWith("name", 200)
  })

  it("narrows «Назва» by 150px and widens «Теги» by 150px: each changes only itself, nothing is eaten back", () => {
    const onWidth = vi.fn()
    const columns = DEFAULT_COLUMNS.map((column) => column.key === "tags" ? { ...column, visible: true } : column)
    const widths = (container: HTMLElement) => [...container.querySelectorAll("col")].map((col) => col.style.width)
    const view = table(undefined, [item], onWidth, columns, 360)
    const before = widths(view.container)
    const drag = (handle: HTMLElement, dx: number) => {
      fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientX: 600 })
      fireEvent.pointerMove(handle, { pointerId: 1, clientX: 600 + dx })
      fireEvent.pointerUp(handle, { pointerId: 1, clientX: 600 + dx })
    }
    const separators = screen.getAllByRole("separator")
    drag(separators[0], -150)
    expect(onWidth).toHaveBeenLastCalledWith("name", 210)
    drag(separators.at(-1)!, 150)
    expect(onWidth).toHaveBeenLastCalledWith("tags", 350)
    // The page saves them; the table then shows exactly those widths and every other column as it was.
    view.rerender(<CatalogTable rows={[item]} columns={columns.map((column) => column.key === "tags" ? { ...column, width: 350 } : column)} nameWidth={210}
      selected={new Map()} selecting selectable={() => true} atLimit={false} allOnPage={false} pageSelectable={1}
      onToggle={vi.fn()} onToggleAll={vi.fn()} sortProps={{ activeField: "updated", direction: "desc", onSort: vi.fn() }} eventName={() => undefined}
      regionRef={{ current: null }} busy={false} onWidth={onWidth} />)
    const after = widths(view.container)
    expect(after[1]).toBe("210px")
    expect(after.at(-2)).toBe("350px")
    expect(after.filter((_, index) => index !== 1 && index !== after.length - 2)).toEqual(before.filter((_, index) => index !== 1 && index !== before.length - 2))
  })

  it("every column resizes on its own both ways: −120px then +200px, clamped at its minimum", () => {
    const onWidth = vi.fn()
    const columns = DEFAULT_COLUMNS.map((column) => ({ ...column, visible: true }))
    const { container } = table(undefined, [item], onWidth, columns)
    const separators = screen.getAllByRole("separator")
    expect(separators).toHaveLength(10)
    separators.forEach((handle) => {
      const start = Number(handle.getAttribute("aria-valuenow"))
      const min = Number(handle.getAttribute("aria-valuemin"))
      const others = () => [...container.querySelectorAll("col")].filter((_, index) => index !== separators.indexOf(handle) + 1).map((col) => col.style.width)
      const before = others()
      fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientX: 600 })
      fireEvent.pointerMove(handle, { pointerId: 1, clientX: 480 })
      expect(others()).toEqual(before)
      fireEvent.pointerUp(handle, { pointerId: 1, clientX: 480 })
      const narrowed = Math.max(min, start - 120)
      expect(onWidth.mock.lastCall![1]).toBe(narrowed)
      // Widening works the same way (the table here keeps the width it was given: the page stores the result).
      fireEvent.pointerDown(handle, { pointerId: 2, button: 0, clientX: 600 })
      fireEvent.pointerMove(handle, { pointerId: 2, clientX: 800 })
      fireEvent.pointerUp(handle, { pointerId: 2, clientX: 800 })
      expect(onWidth.mock.lastCall![1]).toBe(start + 200)
    })
  })
})
