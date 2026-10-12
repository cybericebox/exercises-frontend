import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import type { Exercise } from "@/api/exercises/catalog"
import { OWNERSHIP } from "@/test/exerciseFixtures"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/api/exercises/catalog", async (orig) => ({ ...(await orig<typeof import("@/api/exercises/catalog")>()), setExerciseAccess: vi.fn() }))
vi.mock("@/api/events/list", () => ({ listNearestEvents: vi.fn(), listEventOptions: vi.fn(), getEventOption: vi.fn() }))

import { setExerciseAccess } from "@/api/exercises/catalog"
import { listNearestEvents } from "@/api/events/list"
import { AccessDialog } from "./AccessDialog"

const exercise: Exercise = {
  ...OWNERSHIP, ID: "ex-1", Name: "Web", Description: "", Tags: [], DraftVersionID: "v-1", PublishedVersionID: null,
  ArchivedAt: null, HasChanges: true, CreatedAt: "", CreatedBy: null, UpdatedAt: "", UpdatedBy: null,
  AccessLevel: "selected", AccessEventIDs: ["e1", "e2"], AccessEvents: [{ ID: "e1", Name: "Winter" }, { ID: "e2", Name: "Spring" }],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listNearestEvents).mockResolvedValue([{ ID: "e1", Name: "Winter", Tag: "winter" }, { ID: "e2", Name: "Spring", Tag: "spring" }])
  vi.mocked(setExerciseAccess).mockResolvedValue(exercise)
})

describe("catalog access Save", () => {
  it("disables visible clean Save and treats a reselected event-ID set as unchanged", async () => {
    render(<AccessDialog exercise={exercise} onClose={vi.fn()} onSaved={vi.fn()} />)
    await act(async () => {})
    expect(screen.getByRole("button", { name: "exercises.access.save" })).toBeDisabled()
    fireEvent.click(screen.getByRole("checkbox", { name: /Winter/ }))
    expect(screen.getByRole("button", { name: "exercises.access.save" })).toBeEnabled()
    fireEvent.click(screen.getByRole("checkbox", { name: /Winter/ }))
    expect(screen.getByRole("button", { name: "exercises.access.save" })).toBeDisabled()
    expect(setExerciseAccess).not.toHaveBeenCalled()
  })

  it("holds an unchanged baseline after a failed request and permits retry", async () => {
    vi.mocked(setExerciseAccess).mockRejectedValueOnce(new Error("offline"))
    render(<AccessDialog exercise={exercise} onClose={vi.fn()} onSaved={vi.fn()} />)
    await act(async () => {})
    fireEvent.click(screen.getByRole("radio", { name: /exercises.access.level.none/ }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "exercises.access.save" })))
    expect(screen.getByRole("button", { name: "exercises.access.save" })).toBeEnabled()
    expect(setExerciseAccess).toHaveBeenCalledWith("ex-1", { AccessLevel: "none", EventIDs: [] })
  })

  it("keeps fields interactive and does not close newer edits when an older request succeeds", async () => {
    let resolve: (value: Exercise) => void = () => undefined
    vi.mocked(setExerciseAccess).mockReturnValueOnce(new Promise((done) => { resolve = done }))
    const onClose = vi.fn()
    const onSaved = vi.fn()
    render(<AccessDialog exercise={exercise} onClose={onClose} onSaved={onSaved} />)
    await act(async () => {})
    fireEvent.click(screen.getByRole("radio", { name: /exercises.access.level.none/ }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "exercises.access.save" })))
    expect(screen.getByRole("radio", { name: /exercises.access.level.all/ })).toBeEnabled()
    fireEvent.click(screen.getByRole("radio", { name: /exercises.access.level.all/ }))
    await act(async () => resolve({ ...exercise, AccessLevel: "none", AccessEventIDs: [], AccessEvents: [] }))
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole("radio", { name: /exercises.access.level.all/ })).toBeChecked()
    expect(screen.getByRole("button", { name: "exercises.access.save" })).toBeEnabled()
  })

  it("follows clean server refreshes without overwriting a dirty draft", async () => {
    const { rerender } = render(<AccessDialog exercise={exercise} onClose={vi.fn()} onSaved={vi.fn()} />)
    await act(async () => {})
    const updated = { ...exercise, AccessLevel: "none" as const, AccessEventIDs: [], AccessEvents: [] }
    rerender(<AccessDialog exercise={updated} onClose={vi.fn()} onSaved={vi.fn()} />)
    expect(screen.getByRole("radio", { name: /exercises.access.level.none/ })).toBeChecked()
    expect(screen.getByRole("button", { name: "exercises.access.save" })).toBeDisabled()
    fireEvent.click(screen.getByRole("radio", { name: /exercises.access.level.all/ }))
    rerender(<AccessDialog exercise={exercise} onClose={vi.fn()} onSaved={vi.fn()} />)
    expect(screen.getByRole("radio", { name: /exercises.access.level.all/ })).toBeChecked()
  })
})
