import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { confirmServiceUnavailable, reportServiceAvailable, reportServiceUnavailable } from "@/lib/serviceStatus"
import { ServiceStatusGate } from "./ServiceStatusGate"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))

afterEach(() => {
  act(() => { reportServiceAvailable() })
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("ServiceStatusGate", () => {
  it("shows the notice only after a failed confirmation twelve seconds later", async () => {
    vi.useFakeTimers()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 502 })))
    render(<ServiceStatusGate />)

    act(() => { reportServiceUnavailable() })
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTime(11999) })
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(screen.getByRole("alertdialog")).toBeInTheDocument()
  })

  it("does not overlap a manual retry with the automatic availability probe", () => {
    const fetch = vi.fn(() => new Promise<Response>(() => {}))
    vi.stubGlobal("fetch", fetch)
    reportServiceUnavailable()
    confirmServiceUnavailable()
    vi.useFakeTimers()
    render(<ServiceStatusGate />)
    fireEvent.click(screen.getByRole("button", { name: "error.retry" }))
    expect(fetch).toHaveBeenCalledOnce()
    act(() => { vi.advanceTimersByTime(5000) })
    expect(fetch).toHaveBeenCalledOnce()
  })
})
