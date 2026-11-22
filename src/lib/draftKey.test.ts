import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/api/me/draftKey", () => ({ fetchDraftKey: vi.fn() }))

import { ApiError } from "@/api/client"
import { fetchDraftKey } from "@/api/me/draftKey"
import { currentDraftKey, draftKeyState, getDraftKey, resetDraftKeyForTests, startDraftKey } from "./draftKey"

const mockFetch = vi.mocked(fetchDraftKey)
const KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(5)))

beforeEach(() => { resetDraftKeyForTests(); mockFetch.mockReset() })
afterEach(() => { vi.useRealTimers(); resetDraftKeyForTests() })

describe("draft key", () => {
  it("imports the key as a non-extractable AES-GCM key and fetches it once per tab", async () => {
    mockFetch.mockResolvedValue({ ID: "key-1", Key: KEY })
    const key = await getDraftKey()
    expect(key?.id).toBe("key-1")
    expect(key?.key.extractable).toBe(false)
    expect(key?.key.algorithm).toMatchObject({ name: "AES-GCM", length: 256 })
    await getDraftKey()
    startDraftKey()
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(currentDraftKey()).toBe(key)
  })

  it("retries with a growing pause while the backend is unreachable", async () => {
    vi.useFakeTimers()
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"))
    startDraftKey()
    await vi.advanceTimersByTimeAsync(0)
    expect(draftKeyState()).toBe("waiting")
    await vi.advanceTimersByTimeAsync(1000)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1999)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    mockFetch.mockResolvedValue({ ID: "key-1", Key: KEY })
    await vi.advanceTimersByTimeAsync(1)
    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(draftKeyState()).toBe("ready")
  })

  it("stops when the server refuses (signed out) and rejects a key of the wrong size", async () => {
    mockFetch.mockRejectedValue(new ApiError(401, null))
    expect(await getDraftKey()).toBeNull()
    expect(draftKeyState()).toBe("refused")
    resetDraftKeyForTests()
    vi.useFakeTimers()
    mockFetch.mockResolvedValue({ ID: "key-1", Key: btoa("short") })
    expect(await getDraftKey()).toBeNull()
    expect(draftKeyState()).toBe("waiting")
  })
})
