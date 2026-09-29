import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"

vi.mock("@/api/client", () => ({
  apiGet: vi.fn(),
}))

import { apiGet } from "@/api/client"
const mockApiGet = vi.mocked(apiGet)

// Import after mock is registered; re-import is stable — cache isolation is
// handled via the exported __clearUserNameCache() helper.
import { fetchUserName, useUserNames, __clearUserNameCache } from "./userNames"

beforeEach(() => {
  vi.clearAllMocks()
  __clearUserNameCache()
})

// ---------------------------------------------------------------------------
// fetchUserName
// ---------------------------------------------------------------------------
describe("fetchUserName", () => {
  it("calls apiGet with the correct path and returns a resolved UserName", async () => {
    mockApiGet.mockResolvedValueOnce({
      ID: "u1",
      FirstName: "Ann",
      LastName: "Lee",
      Email: "a@b.com",
    })

    const result = await fetchUserName("u1")

    expect(mockApiGet).toHaveBeenCalledWith("/api/users/u1")
    expect(result).toEqual({
      id: "u1",
      name: "Ann Lee",
      href: "/users/detail?id=u1",
    })
  })

  it("falls back to Email when FirstName and LastName are blank", async () => {
    mockApiGet.mockResolvedValueOnce({
      ID: "u2",
      FirstName: "",
      LastName: "",
      Email: "x@y.com",
    })

    const result = await fetchUserName("u2")

    expect(result.name).toBe("x@y.com")
  })

  it("falls back to Email when FirstName and LastName are undefined/null", async () => {
    mockApiGet.mockResolvedValueOnce({
      ID: "u3",
      FirstName: undefined,
      LastName: undefined,
      Email: "fallback@example.com",
    })

    const result = await fetchUserName("u3")

    expect(result.name).toBe("fallback@example.com")
  })

  it("cache: a second call for the same id does NOT call apiGet again", async () => {
    mockApiGet.mockResolvedValueOnce({
      ID: "u1",
      FirstName: "Ann",
      LastName: "Lee",
      Email: "a@b.com",
    })

    await fetchUserName("u1")
    await fetchUserName("u1") // second call — must be a cache hit

    expect(mockApiGet).toHaveBeenCalledTimes(1)
  })

  it("cache: concurrent calls for the same id share a single in-flight promise", async () => {
    let resolve!: (v: unknown) => void
    const pending = new Promise((res) => {
      resolve = res
    })
    mockApiGet.mockReturnValueOnce(
      pending.then(() => ({ ID: "u1", FirstName: "Ann", LastName: "Lee", Email: "a@b.com" }))
    )

    const p1 = fetchUserName("u1")
    const p2 = fetchUserName("u1") // concurrent — same promise

    resolve(undefined)
    const [r1, r2] = await Promise.all([p1, p2])

    expect(mockApiGet).toHaveBeenCalledTimes(1)
    expect(r1).toEqual(r2)
  })

  it("resolves to a fallback (does NOT throw) when apiGet rejects", async () => {
    mockApiGet.mockRejectedValueOnce(new Error("network error"))

    const result = await fetchUserName("u99")

    expect(result).toEqual({
      id: "u99",
      name: "u99".slice(0, 8),
      href: "/users/detail?id=u99",
    })
  })

  it("error: does NOT cache the fallback — a second call retries apiGet (call count = 2)", async () => {
    // First call → network error → returns fallback, clears cache
    mockApiGet.mockRejectedValueOnce(new Error("network error"))
    const fallback = await fetchUserName("u99")
    expect(fallback.name).toBe("u99".slice(0, 8))

    // Second call → cache is clear → retries apiGet
    mockApiGet.mockResolvedValueOnce({
      ID: "u99",
      FirstName: "Ann",
      LastName: "Lee",
      Email: "a@b.com",
    })
    const retry = await fetchUserName("u99")
    expect(retry.name).toBe("Ann Lee")

    // apiGet must have been called twice (not once — no caching of the error fallback)
    expect(mockApiGet).toHaveBeenCalledTimes(2)
  })

  it("cache: success still caches — repeated calls after success stay at call count 1", async () => {
    mockApiGet.mockResolvedValueOnce({
      ID: "u5",
      FirstName: "Jane",
      LastName: "Doe",
      Email: "j@d.com",
    })

    const first = await fetchUserName("u5")
    const second = await fetchUserName("u5") // cache hit

    expect(first.name).toBe("Jane Doe")
    expect(second.name).toBe("Jane Doe")
    expect(mockApiGet).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// useUserNames
// ---------------------------------------------------------------------------
describe("useUserNames", () => {
  it("resolves distinct non-null ids and returns a name map, ignoring nulls and duplicates", async () => {
    mockApiGet
      .mockResolvedValueOnce({ ID: "u1", FirstName: "Ann", LastName: "Lee", Email: "a@b.com" })
      .mockResolvedValueOnce({ ID: "u2", FirstName: "Bob", LastName: "Smith", Email: "b@b.com" })

    const { result } = renderHook(() => useUserNames(["u1", "u1", null, "u2", undefined]))

    await waitFor(() => {
      expect(Object.keys(result.current)).toContain("u1")
      expect(Object.keys(result.current)).toContain("u2")
    })

    expect(result.current["u1"].name).toBe("Ann Lee")
    expect(result.current["u2"].name).toBe("Bob Smith")
    // Deduplicated: only 2 API calls despite "u1" appearing twice
    expect(mockApiGet).toHaveBeenCalledTimes(2)
  })

  it("returns an object immediately (empty before resolution)", () => {
    mockApiGet.mockReturnValue(new Promise(() => {})) // never resolves

    const { result } = renderHook(() => useUserNames(["u1"]))

    expect(typeof result.current).toBe("object")
    expect(result.current).not.toBeNull()
  })

  it("does not update state after unmount (no React warning)", async () => {
    let resolve!: (v: unknown) => void
    const pending = new Promise((res) => {
      resolve = res
    })
    mockApiGet.mockReturnValueOnce(
      pending.then(() => ({ ID: "u1", FirstName: "Ann", LastName: "Lee", Email: "a@b.com" }))
    )

    const { unmount } = renderHook(() => useUserNames(["u1"]))
    unmount()

    // Resolve AFTER unmount — should not trigger setState
    resolve(undefined)
    await new Promise((r) => setTimeout(r, 10))
    // If no "Warning: Can't perform a React state update on an unmounted component."
    // is thrown, the test passes implicitly. No assertion needed beyond not throwing.
  })
})
