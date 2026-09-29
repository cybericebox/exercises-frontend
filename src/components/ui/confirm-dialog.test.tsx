import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))

import { ConfirmDialog } from "./confirm-dialog"

function renderDialog(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onCancel = vi.fn()
  const onConfirm = vi.fn()
  render(<ConfirmDialog open title="Delete event?" description="This cannot be undone." confirmLabel="Delete"
    tone="danger" onCancel={onCancel} onConfirm={onConfirm} {...props} />)
  return { onCancel, onConfirm }
}

describe("ConfirmDialog", () => {
  it("focuses Cancel first and makes the danger action a solid red button", () => {
    renderDialog()
    expect(screen.getByRole("button", { name: "confirm.cancel" })).toHaveFocus()
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass("bg-destructive")
  })

  it("uses the primary button for a non-destructive confirmation", () => {
    renderDialog({ tone: "default" })
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass("bg-primary")
  })

  it("cancels on Esc and confirms on the action", () => {
    const { onCancel, onConfirm } = renderDialog()
    fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    expect(onConfirm).toHaveBeenCalledOnce()
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it("keeps the dialog while busy, shows the crest loader and an inline error", () => {
    const { onCancel } = renderDialog({ busy: true, error: "Failed" })
    const action = screen.getByRole("button", { name: /Delete/ })
    expect(action).toHaveAttribute("aria-busy", "true")
    expect(action.querySelector(".crest-loader")).toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent("Failed")
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    expect(onCancel).not.toHaveBeenCalled()
  })
})
