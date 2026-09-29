import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import type { VersionListItem } from "@/api/exercises/versions"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
vi.mock("@/lib/userNames", () => ({ useUserNames: () => ({ u1: { id: "u1", name: "O. Koval", href: "" } }) }))
vi.mock("@/api/exercises/versions", () => ({ listVersions: vi.fn() }))

import { listVersions } from "@/api/exercises/versions"
import { HistoryDialog, sortHistory } from "./HistoryDialog"

const item = (patch: Partial<VersionListItem>): VersionListItem => ({
  ID: "x", Status: "checkpoint", AdminNote: "", Label: "", VariantCount: 1,
  CreatedAt: "2026-09-10T10:00:00Z", CreatedBy: null, PublishedAt: null, ...patch,
})

const versions = [
  item({ ID: "old", Status: "unpublished", CreatedAt: "2026-09-01T10:00:00Z", PublishedAt: "2026-09-12T14:05:00Z" }),
  item({ ID: "snap", Status: "checkpoint", Label: "Before topology rework", AdminNote: "working notes", CreatedAt: "2026-09-22T16:10:00Z", CreatedBy: "u1" }),
  item({ ID: "draft", Status: "draft", CreatedAt: "2026-09-20T10:00:00Z" }),
  item({ ID: "pub", Status: "published", CreatedAt: "2026-09-15T10:00:00Z", PublishedAt: "2026-09-20T09:30:00Z" }),
]

describe("sortHistory", () => {
  it("puts the working copy first and the rest newest first", () => {
    expect(sortHistory(versions).map((v) => v.ID)).toEqual(["draft", "snap", "pub", "old"])
  })
})

describe("HistoryDialog", () => {
  beforeEach(() => { vi.mocked(listVersions).mockResolvedValue(versions) })

  it("labels entries by kind and shows the snapshot caption and author", async () => {
    render(<HistoryDialog exerciseId="ex-1" viewingVersionId={null} onClose={vi.fn()} onView={vi.fn()} />)
    const rows = await screen.findAllByRole("listitem")
    expect(rows.map((row) => within(row).getAllByText(/admin\.exHistory\.kind\./)[0].textContent)).toEqual([
      "admin.exHistory.kind.draft", "admin.exHistory.kind.checkpoint", "admin.exHistory.kind.published", "admin.exHistory.kind.unpublished",
    ])
    expect(within(rows[1]).getByText("«Before topology rework»")).toBeInTheDocument()
    expect(within(rows[1]).queryByText(/working notes/)).not.toBeInTheDocument()
    expect(within(rows[1]).getByText("O. Koval")).toBeInTheDocument()
    expect(within(rows[0]).getByRole("button", { name: "admin.exHistory.opened" })).toBeDisabled()
  })

  it("opens an older entry and returns to the current copy", async () => {
    const onView = vi.fn()
    const { rerender } = render(<HistoryDialog exerciseId="ex-1" viewingVersionId={null} onClose={vi.fn()} onView={onView} />)
    const rows = await screen.findAllByRole("listitem")
    fireEvent.click(within(rows[1]).getByRole("button", { name: "admin.exHistory.view" }))
    expect(onView).toHaveBeenCalledWith("snap")
    rerender(<HistoryDialog exerciseId="ex-1" viewingVersionId="snap" onClose={vi.fn()} onView={onView} />)
    const current = (await screen.findAllByRole("listitem"))[0]
    fireEvent.click(within(current).getByRole("button", { name: "admin.exHistory.view" }))
    expect(onView).toHaveBeenLastCalledWith(null)
  })

  it("reports a failed load", async () => {
    vi.mocked(listVersions).mockRejectedValueOnce(new Error("offline"))
    render(<HistoryDialog exerciseId="ex-1" viewingVersionId={null} onClose={vi.fn()} onView={vi.fn()} />)
    expect(await screen.findByText("admin.exHistory.loadError")).toBeInTheDocument()
  })
})
