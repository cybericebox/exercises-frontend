import { afterEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { RoleProvider, useRole } from "./useRole"
import { getServiceStatus, isServiceDown, reportServiceAvailable } from "./serviceStatus"
import { fetchMe } from "./auth"
import { ApiError } from "@/api/client"

vi.mock("./auth", () => ({ fetchMe: vi.fn() }))

function State() {
  const { isLoading, role, error, retry } = useRole()
  if (error) return <button onClick={retry}>failed</button>
  return <span>{isLoading ? "loading" : role ?? "anonymous"}</span>
}

afterEach(() => {
  reportServiceAvailable()
  vi.mocked(fetchMe).mockReset()
})

describe("admin session check", () => {
  it("reports a failed check on a real backend 5xx instead of staying on the loader", async () => {
    vi.mocked(fetchMe).mockRejectedValue(new ApiError(500, {}, "m", undefined, 50310, undefined, "01a112da-1"))
    render(<RoleProvider><State /></RoleProvider>)
    expect(await screen.findByRole("button", { name: "failed" })).toBeInTheDocument()
    expect(screen.queryByText("loading")).not.toBeInTheDocument()
    expect(isServiceDown()).toBe(false)
  })

  it.each([
    ["a network error", () => new TypeError("Failed to fetch")],
    ["a proxy 502 without X-Request-ID", () => new ApiError(502, "", undefined)],
  ])("hands %s to the service gate and keeps the loader", async (_name, make) => {
    vi.mocked(fetchMe).mockRejectedValue(make())
    render(<RoleProvider><State /></RoleProvider>)
    await vi.waitFor(() => expect(isServiceDown()).toBe(true))
    // the overlay shows at once, no grace period
    expect(getServiceStatus()).toBe("down")
    expect(screen.getByText("loading")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "failed" })).toBeNull()
  })

  it("re-runs the session check when the gate sees the backend back", async () => {
    vi.mocked(fetchMe).mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue(null)
    render(<RoleProvider><State /></RoleProvider>)
    await vi.waitFor(() => expect(isServiceDown()).toBe(true))
    act(() => reportServiceAvailable())
    expect(await screen.findByText("anonymous")).toBeInTheDocument()
  })

  it("runs the check again on retry", async () => {
    vi.mocked(fetchMe).mockRejectedValueOnce(new ApiError(500, {}, "m", undefined, 50310, undefined, "01a112da-1")).mockResolvedValue(null)
    render(<RoleProvider><State /></RoleProvider>)
    fireEvent.click(await screen.findByRole("button", { name: "failed" }))
    expect(await screen.findByText("anonymous")).toBeInTheDocument()
    expect(fetchMe).toHaveBeenCalledTimes(2)
  })

  it("treats a confirmed anonymous session as signed out", async () => {
    vi.mocked(fetchMe).mockResolvedValue(null)
    render(<RoleProvider><State /></RoleProvider>)
    expect(await screen.findByText("anonymous")).toBeInTheDocument()
  })
})
