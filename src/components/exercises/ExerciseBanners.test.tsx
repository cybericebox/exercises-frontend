import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: vi.fn((key: string) => key) }))

vi.mock("@/lib/exerciseStatus", () => ({ formatExerciseDateTime: (iso: string) => `formatted ${iso}` }))

import { ArchivedBanner, DraftConflictBanner, VersionBanner } from "./ExerciseBanners"
import { t } from "@/i18n/t"

describe("exercise banners", () => {
  it("offers going back and restoring a viewed version", () => {
    const onBack = vi.fn()
    const onRestore = vi.fn()
    render(<VersionBanner label="Viewing 12.09.2026" canRestore busy={false} onBack={onBack} onRestore={onRestore} />)
    expect(screen.getByText("Viewing 12.09.2026")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "admin.exPage.version.back" }))
    fireEvent.click(screen.getByRole("button", { name: "admin.exPage.version.restore" }))
    expect(onBack).toHaveBeenCalled()
    expect(onRestore).toHaveBeenCalled()
  })

  it("hides restore and unarchive without permission", () => {
    render(<>
      <VersionBanner label="v" canRestore={false} busy={false} onBack={vi.fn()} onRestore={vi.fn()} />
      <ArchivedBanner canUnarchive={false} busy={false} onUnarchive={vi.fn()} />
    </>)
    expect(screen.queryByRole("button", { name: "admin.exPage.version.restore" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "admin.exPage.action.unarchive" })).not.toBeInTheDocument()
    expect(screen.getByText("admin.exPage.archived.banner")).toBeInTheDocument()
  })

  it("says who changed the working copy and when, and offers the reload", () => {
    const onReload = vi.fn()
    render(<DraftConflictBanner conflict={{ revision: "r", savedBy: "Olena Koval", savedAt: "2026-11-21T10:00:03Z" }} onReload={onReload} />)
    expect(screen.getByRole("alert")).toHaveTextContent("admin.exPage.conflict.byAt")
    expect(t).toHaveBeenCalledWith("admin.exPage.conflict.byAt", { name: "Olena Koval", date: "formatted 2026-11-21T10:00:03Z" })
    expect(screen.getByText("admin.exPage.conflict.hint")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "admin.exPage.conflict.reload" }))
    expect(onReload).toHaveBeenCalled()
  })

  it("has a text for a working copy discarded meanwhile (no saver, no time)", () => {
    render(<DraftConflictBanner conflict={{ revision: "", savedBy: "", savedAt: "" }} onReload={vi.fn()} />)
    expect(screen.getByRole("alert")).toHaveTextContent("admin.exPage.conflict.unknown")
  })

  it("names the restore on its busy button", () => {
    render(<VersionBanner label="v" canRestore busy restoring onBack={vi.fn()} onRestore={vi.fn()} />)
    expect(screen.getByRole("button", { name: /admin\.exPage\.version\.restoring/ })).toHaveAttribute("aria-busy", "true")
  })
})
