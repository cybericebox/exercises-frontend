import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { ExerciseListItem, ExercisePermissions } from "@/api/exercises/catalog"
import { LIST_EXTRAS, OWNERSHIP } from "@/test/exerciseFixtures"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, unknown>) => vars ? `${key} ${JSON.stringify(vars)}` : key }))
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock("@/api/exercises/bulk", async (orig) => ({
  ...(await orig<typeof import("@/api/exercises/bulk")>()), bulkArchive: vi.fn(), bulkUnarchive: vi.fn(), bulkSetAccess: vi.fn(),
}))
vi.mock("@/api/events/list", () => ({ listNearestEvents: vi.fn().mockResolvedValue([]), listEventOptions: vi.fn(), getEventOption: vi.fn() }))

import { bulkArchive, bulkSetAccess, bulkUnarchive } from "@/api/exercises/bulk"
import { toast } from "@/components/ui/toast"
import { BulkActions } from "./BulkActions"

const RIGHTS: ExercisePermissions = { CanRead: true, CanEdit: true, CanPublish: true, CanDelete: true, CanManageAccess: true, CanPropose: false, CanExport: true }

function row(id: string, patch: Partial<ExerciseListItem> = {}): ExerciseListItem {
  return {
    ...OWNERSHIP, ...LIST_EXTRAS, ID: id, Name: id, Description: "", Tags: [], HasDraft: false, HasPublished: true, Status: "published",
    ArchivedAt: null, CreatedAt: "", UpdatedAt: "", Permissions: RIGHTS, ...patch,
  }
}

const card = (id: string, archivedAt: string | null) => ({ ...row(id), DraftVersionID: null, PublishedVersionID: "v", ArchivedAt: archivedAt, HasChanges: false, CreatedBy: null, UpdatedBy: null })

function setup(selected: ExerciseListItem[], canExport = true) {
  const onChanged = vi.fn()
  const onClear = vi.fn()
  const onExport = vi.fn()
  render(<BulkActions selected={selected} canExport={canExport} atLimit={false} onExport={onExport} onClear={onClear} onChanged={onChanged} />)
  return { onChanged, onClear, onExport }
}

beforeEach(() => vi.clearAllMocks())

describe("catalog bulk actions", () => {
  it("shows only the actions the user can perform for at least one selected task", () => {
    const { unmount } = render(<BulkActions selected={[row("a", { Permissions: { ...RIGHTS, CanManageAccess: false } })]} canExport atLimit={false}
      onExport={vi.fn()} onClear={vi.fn()} onChanged={vi.fn()} />)
    expect(screen.getByRole("button", { name: "exercises.bulk.archive.action" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "exercises.bulk.unarchive.action" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "exercises.bulk.access.action" })).not.toBeInTheDocument()
    unmount()

    setup([row("v", { Permissions: { ...RIGHTS, CanEdit: false, CanManageAccess: false, CanExport: false } })], false)
    for (const name of ["exercises.bulk.archive.action", "exercises.bulk.unarchive.action", "exercises.bulk.access.action", "admin.ex.selection.export"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument()
    }
  })

  it("hides export when a selected task may not be exported", () => {
    setup([row("a"), row("b", { Permissions: { ...RIGHTS, CanExport: false } })])
    expect(screen.queryByRole("button", { name: "admin.ex.selection.export" })).not.toBeInTheDocument()
  })

  it("archives through a danger confirmation with the count, shows the progress and clears the selection", async () => {
    let finish: () => void = () => undefined
    vi.mocked(bulkArchive).mockImplementation((ids) => new Promise((resolve) => {
      finish = () => resolve(ids.map((ID) => ({ ID, Exercise: card(ID, "2026-10-19T10:00:00Z"), Code: 0 })))
    }))
    const { onChanged, onClear } = setup([row("a"), row("b"), row("c", { ArchivedAt: "2026-10-01T00:00:00Z", Status: "archived" })])
    fireEvent.click(screen.getByRole("button", { name: "exercises.bulk.archive.action" }))
    const dialog = screen.getByRole("dialog")
    expect(within(dialog).getByText('exercises.bulk.archive.title {"count":2}')).toBeInTheDocument()
    const confirm = within(dialog).getByRole("button", { name: "admin.exPage.archive.confirm" })
    expect(confirm.className).toMatch(/danger|destructive/)
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "confirm.cancel" }))
    fireEvent.click(confirm)
    await waitFor(() => expect(within(dialog).getByRole("button", { name: /exercises\.bulk\.archive\.busy/ })).toHaveTextContent('{"done":0,"total":2}'))
    expect(bulkArchive).toHaveBeenCalledWith(["a", "b"])
    await act(async () => finish())
    await waitFor(() => expect(onClear).toHaveBeenCalled())
    expect(onChanged).toHaveBeenCalledWith([expect.objectContaining({ ID: "a" }), expect.objectContaining({ ID: "b" })])
    // «c» was archived already: reported as skipped with its reason.
    expect(screen.getByText('exercises.bulk.summary.counts {"changed":2,"skipped":1}')).toBeInTheDocument()
    expect(screen.getByText(/exercises\.bulk\.reason\.alreadyArchived/)).toBeInTheDocument()
  })

  it("unarchives with the normal primary button and toasts when every task changed", async () => {
    vi.mocked(bulkUnarchive).mockImplementation(async (ids) => ids.map((ID) => ({ ID, Exercise: card(ID, null), Code: 0 })))
    const { onClear } = setup([row("a", { ArchivedAt: "2026-10-01T00:00:00Z", Status: "archived" })])
    fireEvent.click(screen.getByRole("button", { name: "exercises.bulk.unarchive.action" }))
    const confirm = within(screen.getByRole("dialog")).getByRole("button", { name: "admin.exPage.action.unarchive" })
    expect(confirm.className).not.toMatch(/destructive/)
    await act(async () => fireEvent.click(confirm))
    await waitFor(() => expect(onClear).toHaveBeenCalled())
    expect(toast.success).toHaveBeenCalledWith('exercises.bulk.done {"count":1}')
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("lists the server's reasons for skipped tasks, grouped", async () => {
    vi.mocked(bulkArchive).mockResolvedValue([
      { ID: "a", Exercise: card("a", "2026-10-19T10:00:00Z"), Code: 0 },
      { ID: "b", Exercise: null, Code: 60957 },
      { ID: "c", Exercise: null, Code: 60957 },
    ])
    setup([row("a"), row("b"), row("c")])
    fireEvent.click(screen.getByRole("button", { name: "exercises.bulk.archive.action" }))
    await act(async () => fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "admin.exPage.archive.confirm" })))
    await waitFor(() => expect(screen.getByText('exercises.bulk.summary.counts {"changed":1,"skipped":2}')).toBeInTheDocument())
    expect(screen.getByText('exercises.bulk.summary.reason {"reason":"exercises.err.forbidden","count":2}')).toBeInTheDocument()
  })

  it("changes access of every selected task through the same access dialog", async () => {
    vi.mocked(bulkSetAccess).mockImplementation(async (ids) => ids.map((ID) => ({ ID, Exercise: { ...card(ID, null), AccessLevel: "none" as const }, Code: 0 })))
    const { onChanged, onClear } = setup([row("a"), row("b")])
    fireEvent.click(screen.getByRole("button", { name: "exercises.bulk.access.action" }))
    const dialog = screen.getByRole("dialog")
    expect(within(dialog).getByText("exercises.access.dialogTitle")).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole("radio", { name: /exercises.access.level.none/ }))
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "exercises.access.save" })))
    await waitFor(() => expect(onClear).toHaveBeenCalled())
    expect(bulkSetAccess).toHaveBeenCalledWith(["a", "b"], { AccessLevel: "none", EventIDs: [] })
    expect(onChanged).toHaveBeenCalledWith([expect.objectContaining({ ID: "a", AccessLevel: "none" }), expect.objectContaining({ ID: "b", AccessLevel: "none" })])
  })
})
