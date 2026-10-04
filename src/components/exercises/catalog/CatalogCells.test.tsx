import { describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))

import { ResourceHeavyBadge, StatusCell } from "./CatalogCells"
import { OWNERSHIP } from "@/test/exerciseFixtures"
import type { ExerciseListItem } from "@/api/exercises/catalog"

const item = (heavy: boolean): ExerciseListItem => ({
  ...OWNERSHIP, ResourceHeavy: heavy, ID: "e1", Name: "Web", Description: "", Tags: [], HasDraft: false, HasPublished: true,
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
