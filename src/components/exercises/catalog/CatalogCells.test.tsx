import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

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
  it("shows the update day in one short line and the full date and time for screen readers", () => {
    const now = new Date(2026, 9, 22, 12, 0)
    const at = (y: number, m: number, d: number) => new Date(y, m, d, 9, 5).toISOString()
    const text = (iso: string) => render(<UpdatedCell iso={iso} now={now} />).container.querySelector("time")!
    expect(text(at(2026, 9, 22)).firstChild?.textContent).toBe("exercises.date.today")
    expect(text(at(2026, 9, 21)).firstChild?.textContent).toBe("exercises.date.yesterday")
    const older = text(at(2026, 9, 3))
    expect(older).toHaveAttribute("dateTime", at(2026, 9, 3))
    expect(older.firstChild?.textContent).toMatch(/^3 жовт/)
    expect(older.textContent).toMatch(/03\.10\.2026, 09:05/)
    expect(text(at(2025, 0, 2)).firstChild?.textContent).toMatch(/2025/)
  })

  it("opens the subtask names in a column from the count, by click or keyboard", async () => {
    render(<SubtaskCountCell count={3} names={["Recon", "Exploit", "Report"]} />)
    const trigger = screen.getByRole("button", { name: "exercises.subtasks.show" })
    expect(trigger).toHaveTextContent("3")
    expect(trigger).toHaveClass("z-10")
    fireEvent.click(trigger)
    const items = await screen.findAllByRole("listitem")
    expect(items.map((item) => item.textContent)).toEqual(["Recon", "Exploit", "Report"])
    fireEvent.keyDown(document.activeElement ?? trigger, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("listitem")).not.toBeInTheDocument())
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
