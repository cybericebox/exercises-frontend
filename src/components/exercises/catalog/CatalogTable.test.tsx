import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

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

function table(state?: React.ReactNode, rows = [item]) {
  return render(<CatalogTable rows={rows} columns={DEFAULT_COLUMNS} selected={new Map()} selecting selectable={() => true} atLimit={false} allOnPage={false} pageSelectable={1}
    onToggle={vi.fn()} onToggleAll={vi.fn()} sortProps={{ activeField: "updated", direction: "desc", onSort: vi.fn() }} eventName={() => undefined}
    regionRef={{ current: null }} busy={false} state={state} />)
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
    expect(screen.getByRole("link", { name: LONG })).toHaveClass("catalog-task-link")
  })

  it("keeps the same header and fills the block with a state, centred", () => {
    const { container } = table(<p>loading</p>, [])
    expect(container.querySelector("table")).toHaveClass("catalog-data-state")
    expect(container.querySelectorAll("thead th")).toHaveLength(8)
    expect(container.querySelector("tbody.ib-table__state")).toHaveTextContent("loading")
  })
})
