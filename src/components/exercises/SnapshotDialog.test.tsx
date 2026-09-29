import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))

import { SNAPSHOT_NOTE_LIMIT, SnapshotDialog } from "./SnapshotDialog"

describe("SnapshotDialog", () => {
  it("passes a trimmed caption", () => {
    const onConfirm = vi.fn()
    render(<SnapshotDialog busy={false} onCancel={vi.fn()} onConfirm={onConfirm} />)
    fireEvent.change(screen.getByLabelText("admin.exPage.snapshot.note"), { target: { value: "  Before rework  " } })
    fireEvent.click(screen.getByRole("button", { name: "admin.exPage.snapshot.confirm" }))
    expect(onConfirm).toHaveBeenCalledWith("Before rework")
  })

  it("blocks captions over the limit", () => {
    render(<SnapshotDialog busy={false} onCancel={vi.fn()} onConfirm={vi.fn()} />)
    fireEvent.change(screen.getByLabelText("admin.exPage.snapshot.note"), { target: { value: "x".repeat(SNAPSHOT_NOTE_LIMIT + 1) } })
    expect(screen.getByRole("alert")).toHaveTextContent("admin.exPage.snapshot.noteTooLong")
    expect(screen.getByRole("button", { name: "admin.exPage.snapshot.confirm" })).toBeDisabled()
  })
})
