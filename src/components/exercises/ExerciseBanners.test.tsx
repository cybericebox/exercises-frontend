import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))

import { ArchivedBanner, VersionBanner } from "./ExerciseBanners"

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
})
