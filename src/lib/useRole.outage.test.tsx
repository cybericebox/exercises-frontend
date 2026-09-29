import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { RoleProvider, useRole } from "./useRole"
import { reportServiceAvailable, reportServiceUnavailable } from "./serviceStatus"
import { fetchMe } from "./auth"

vi.mock("./auth", () => ({ fetchMe: vi.fn() }))

function State() {
  const { isLoading, role } = useRole()
  return <span>{isLoading ? "loading" : role ?? "anonymous"}</span>
}

afterEach(() => {
  reportServiceAvailable()
  vi.mocked(fetchMe).mockReset()
})

describe("admin session check", () => {
  it("keeps the current page pending while the API is unavailable", async () => {
    reportServiceUnavailable()
    vi.mocked(fetchMe).mockRejectedValue(new Error("API 502"))
    render(<RoleProvider><State /></RoleProvider>)
    await waitFor(() => expect(fetchMe).toHaveBeenCalledOnce())
    expect(screen.getByText("loading")).toBeInTheDocument()
  })

  it("treats a confirmed anonymous session as signed out", async () => {
    vi.mocked(fetchMe).mockResolvedValue(null)
    render(<RoleProvider><State /></RoleProvider>)
    expect(await screen.findByText("anonymous")).toBeInTheDocument()
  })
})
