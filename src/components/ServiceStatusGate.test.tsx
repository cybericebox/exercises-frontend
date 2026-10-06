import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { confirmServiceUnavailable, getServiceStatus, reportServiceAvailable, reportServiceUnavailable } from "@/lib/serviceStatus"
import { ServiceStatusGate } from "./ServiceStatusGate"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, string | number>) => vars ? `${key} ${Object.values(vars).join(" ")}` : key }))
vi.mock("@/lib/origins", async (importOriginal) => ({ ...await importOriginal<object>(), apiOrigin: "https://api.test" }))

const reload = vi.fn()
Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, reload } })

afterEach(() => {
  act(() => { reportServiceAvailable() })
  reload.mockClear()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("ServiceStatusGate", () => {
  it("shows the modal only after two failed probes, about 30 s after the first failure", async () => {
    vi.useFakeTimers()
    const fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
    vi.stubGlobal("fetch", fetch)
    render(<><div data-app-root><h1>page</h1></div><ServiceStatusGate /></>)

    act(() => { reportServiceUnavailable() })
    await act(async () => { await vi.advanceTimersByTimeAsync(14_999) })
    expect(fetch).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(fetch).toHaveBeenCalledOnce()
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(14_999) })
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(screen.getByRole("alertdialog")).toBeInTheDocument()
    expect(screen.getByText("serviceGate.title")).toBeInTheDocument()
    expect(screen.getByText("serviceGate.nextTry 3")).toBeInTheDocument()
    // The page underneath stays rendered, dimmed and inert.
    expect(screen.getByText("page")).toBeInTheDocument()
    const behind = document.querySelector("[data-app-root]")
    expect(behind).toHaveClass("ib-service-down-behind")
    expect(behind).toHaveAttribute("inert")
    expect(screen.getByRole("button", { name: "serviceGate.retryNow" })).toHaveFocus()
  })

  it("shows nothing when the API is back before the first probe (10 s)", async () => {
    vi.useFakeTimers()
    const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 401 }))
    vi.stubGlobal("fetch", fetch)
    render(<ServiceStatusGate />)
    act(() => { reportServiceUnavailable() })
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(fetch).toHaveBeenCalledOnce()
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    expect(getServiceStatus()).toBe("up")
  })

  it("shows nothing when the first probe fails but the API is back for the second (20 s)", async () => {
    vi.useFakeTimers()
    const fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
    vi.stubGlobal("fetch", fetch)
    render(<ServiceStatusGate />)
    act(() => { reportServiceUnavailable() })
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
    expect(getServiceStatus()).toBe("suspect")
    fetch.mockResolvedValue(new Response("{}", { status: 200 }))
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    expect(getServiceStatus()).toBe("up")
  })

  it("stops the grace period when the status is reset elsewhere", async () => {
    vi.useFakeTimers()
    const fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
    vi.stubGlobal("fetch", fetch)
    render(<ServiceStatusGate />)
    act(() => { reportServiceUnavailable() })
    act(() => { reportServiceAvailable() })
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(fetch).not.toHaveBeenCalled()
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  })

  it("tries again on the 3/5 s backoff, hides and reloads once the API answers", async () => {
    vi.useFakeTimers()
    const fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
    vi.stubGlobal("fetch", fetch)
    reportServiceUnavailable()
    confirmServiceUnavailable()
    render(<ServiceStatusGate />)

    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(fetch).toHaveBeenCalledOnce()
    expect(screen.getByText("serviceGate.nextTry 5")).toBeInTheDocument()

    fetch.mockResolvedValue(new Response("{}", { status: 401 }))
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    expect(getServiceStatus()).toBe("up")
    expect(reload).toHaveBeenCalledOnce()
  })

  it("does not overlap a manual retry with the automatic try", async () => {
    const fetch = vi.fn(() => new Promise<Response>(() => {}))
    vi.stubGlobal("fetch", fetch)
    reportServiceUnavailable()
    confirmServiceUnavailable()
    vi.useFakeTimers()
    render(<ServiceStatusGate />)
    fireEvent.click(screen.getByRole("button", { name: "serviceGate.retryNow" }))
    expect(fetch).toHaveBeenCalledOnce()
    await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
    expect(fetch).toHaveBeenCalledOnce()
  })
})
