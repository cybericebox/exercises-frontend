import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ToastProvider, toast } from "./toast"

function Actions() {
  return <>
    <button onClick={() => toast.success("Збережено")}>Save</button>
    <button onClick={() => toast.error("Не вдалося зберегти")}>Fail</button>
    <button onClick={() => toast.warning("Збережено частково")}>Warn</button>
  </>
}

describe("ToastProvider", () => {
  it("shows action results as dismissible, accessible toasts", () => {
    render(<ToastProvider><Actions /></ToastProvider>)
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    fireEvent.click(screen.getByRole("button", { name: "Fail" }))
    fireEvent.click(screen.getByRole("button", { name: "Warn" }))

    expect(screen.getByLabelText("Повідомлення про дії")).toHaveClass("fixed", "left-1/2", "top-4", "-translate-x-1/2")
    expect(screen.getByRole("status")).toHaveTextContent("Збережено")
    expect(screen.getAllByRole("alert")).toHaveLength(2)
    expect(screen.getByText("Збережено").closest("[data-tone]")).toHaveAttribute("data-tone", "success")
    expect(screen.getByText("Не вдалося зберегти").closest("[data-tone]")).toHaveAttribute("data-tone", "error")
    expect(screen.getByText("Збережено частково").closest("[data-tone]")).toHaveAttribute("data-tone", "warning")
    fireEvent.click(screen.getByRole("button", { name: "Закрити сповіщення Збережено" }))
    expect(screen.queryByText("Збережено")).not.toBeInTheDocument()
  })

  it("expires a toast automatically", () => {
    vi.useFakeTimers()
    try {
      render(<ToastProvider><Actions /></ToastProvider>)
      fireEvent.click(screen.getByRole("button", { name: "Save" }))
      act(() => vi.advanceTimersByTime(5000))
      expect(screen.queryByText("Збережено")).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
