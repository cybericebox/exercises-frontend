import { describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))

import { ResourceHeavyBadge, StatusCell, SubtaskCountCell, UpdatedCell } from "./CatalogCells"
import { LIST_EXTRAS, OWNERSHIP } from "@/test/exerciseFixtures"
import type { ExerciseListItem } from "@/api/exercises/catalog"

const item = (heavy: boolean): ExerciseListItem => ({
  ...OWNERSHIP, ...LIST_EXTRAS, ResourceHeavy: heavy, ID: "e1", Name: "Web", Description: "", Tags: [], HasDraft: false, HasPublished: true,
  Status: "published", ArchivedAt: null, CreatedAt: "2026-10-01T00:00:00Z", UpdatedAt: "2026-10-01T00:00:00Z",
})

describe("catalog resource-heavy badge", () => {
  it("marks tasks with an approved elevation", () => {
    const { container } = render(<StatusCell item={item(true)} />)
    expect(container.querySelector("[data-badge='resource-heavy']")).toHaveTextContent("exercises.res.heavy")
  })
  it("shows nothing for ordinary tasks", () => {
    const { container } = render(<StatusCell item={item(false)} />)
    expect(container.querySelector("[data-badge='resource-heavy']")).toBeNull()
    expect(render(<ResourceHeavyBadge show={false} />).container).toBeEmptyDOMElement()
  })
})

describe("compact cells", () => {
  it("puts the date over the time so «Оновлено» stays narrow", () => {
    const { container } = render(<UpdatedCell iso="2026-10-18T14:20:00Z" />)
    const time = container.querySelector("time")!
    expect(time).toHaveAttribute("dateTime", "2026-10-18T14:20:00Z")
    expect(time.children).toHaveLength(2)
    expect(time.children[0].textContent).toMatch(/18\.10\.2026/)
    expect(time.children[1].textContent).toMatch(/^\d{2}:\d{2}$/)
  })

  it("shows the subtask count, «—» without a variant", () => {
    const { rerender, container } = render(<SubtaskCountCell count={3} />)
    expect(container).toHaveTextContent("3")
    rerender(<SubtaskCountCell count={null} />)
    expect(container).toHaveTextContent("—")
    rerender(<SubtaskCountCell count={0} />)
    expect(container).toHaveTextContent("0")
  })
})
