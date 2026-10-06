import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { RoleProvider, useRole } from "./useRole"
import { reportServiceAvailable, reportServiceUnavailable } from "./serviceStatus"
import { fetchMe } from "./auth"

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
  it("reports a failed check while the API is unavailable instead of staying on the loader", async () => {
    reportServiceUnavailable()
    vi.mocked(fetchMe).mockRejectedValue(new Error("API 502"))
    render(<RoleProvider><State /></RoleProvider>)
    expect(await screen.findByRole("button", { name: "failed" })).toBeInTheDocument()
    expect(screen.queryByText("loading")).not.toBeInTheDocument()
  })

  it("runs the check again on retry", async () => {
    vi.mocked(fetchMe).mockRejectedValueOnce(new Error("API 500")).mockResolvedValue(null)
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
