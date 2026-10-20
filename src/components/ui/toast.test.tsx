import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ApiError } from "@/api/client"
import { ToastProvider, toast } from "./toast"
import { toastApiError } from "./toastApiError"
import { t } from "@/i18n/t"

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
    fireEvent.click(screen.getByRole("button", { name: "Закрити сповіщення: Збережено" }))
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

  it("offers «Спробувати ще раз» on an overload error and runs the retry once", () => {
    const retry = vi.fn()
    render(<ToastProvider><button onClick={() => toastApiError(new ApiError(503, undefined, undefined, undefined, undefined, 1), retry)}>Go</button></ToastProvider>)
    fireEvent.click(screen.getByRole("button", { name: "Go" }))
    fireEvent.click(screen.getByRole("button", { name: "Спробувати ще раз" }))
    expect(retry).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("treats the overload code (70431) as the overload signal, Retry-After or not", () => {
    render(<ToastProvider><button onClick={() => toastApiError(new ApiError(503, { Status: { Code: 70431 } }, "x", undefined, 70431), vi.fn())}>Busy</button></ToastProvider>)
    fireEvent.click(screen.getByRole("button", { name: "Busy" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Сервер перевантажений, спробуйте за декілька секунд")
    expect(screen.getByRole("button", { name: "Спробувати ще раз" })).toBeInTheDocument()
  })

  it("keeps a personal rate limit (429) on its own message with the wait, without the retry button", () => {
    render(<ToastProvider><button onClick={() => toastApiError(new ApiError(429, { Status: { Code: 70428 } }, "x", undefined, 70428, 30), vi.fn())}>Limited</button></ToastProvider>)
    fireEvent.click(screen.getByRole("button", { name: "Limited" }))
    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent(t("error.tooManyRequests.wait", { seconds: 30 }))
    expect(alert).not.toHaveTextContent("Сервер перевантажений")
    expect(screen.queryByRole("button", { name: "Спробувати ще раз" })).not.toBeInTheDocument()
  })

  it("has no retry button for a plain error or without a handler", () => {
    render(<ToastProvider>
      <button onClick={() => toastApiError(new ApiError(500, undefined), vi.fn())}>Plain</button>
      <button onClick={() => toastApiError(new ApiError(503, undefined, undefined, undefined, undefined, 1))}>NoHandler</button>
    </ToastProvider>)
    fireEvent.click(screen.getByRole("button", { name: "Plain" }))
    fireEvent.click(screen.getByRole("button", { name: "NoHandler" }))
    expect(screen.queryByRole("button", { name: "Спробувати ще раз" })).not.toBeInTheDocument()
  })
})
