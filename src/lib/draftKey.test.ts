import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/api/me/draftKey", () => ({ fetchDraftKey: vi.fn() }))

import { ApiError } from "@/api/client"
import { fetchDraftKey } from "@/api/me/draftKey"
import { currentDraftKey, DRAFT_KEY_LOCK, draftKeyState, getDraftKey, resetDraftKeyForTests, startDraftKey } from "./draftKey"

const mockFetch = vi.mocked(fetchDraftKey)
const KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(5)))

beforeEach(() => { resetDraftKeyForTests(); mockFetch.mockReset() })
afterEach(() => { vi.useRealTimers(); resetDraftKeyForTests(); setLocks(undefined) })

/** A stand-in for navigator.locks: one holder of a name at a time, the others queue (as across the tabs of a browser). */
function fakeLocks() {
  const tails = new Map<string, Promise<unknown>>()
  const held: string[] = []
  const request = vi.fn((name: string, callback: () => Promise<unknown>) => {
    const run = (tails.get(name) ?? Promise.resolve()).then(async () => { held.push(name); try { return await callback() } finally { held.pop() } })
    tails.set(name, run.catch(() => undefined))
    return run
  })
  return { request, held }
}

function setLocks(locks: unknown) {
  Object.defineProperty(navigator, "locks", { configurable: true, value: locks })
}

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

  it.each([401, 403])("keeps waiting on %i (not signed in): no timed retry, it asks again when the tab gets the focus back", async (status) => {
    vi.useFakeTimers()
    mockFetch.mockRejectedValue(new ApiError(status, null))
    expect(await getDraftKey()).toBeNull()
    expect(draftKeyState()).toBe("waiting")
    await vi.advanceTimersByTimeAsync(60_000)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    mockFetch.mockResolvedValue({ ID: "key-1", Key: KEY })
    window.dispatchEvent(new Event("focus"))
    await vi.advanceTimersByTimeAsync(0)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(draftKeyState()).toBe("ready")
  })

  it.each([404, 405, 400])("says the backend has no draft keys on %i and stops asking", async (status) => {
    vi.useFakeTimers()
    mockFetch.mockRejectedValue(new ApiError(status, null))
    expect(await getDraftKey()).toBeNull()
    expect(draftKeyState()).toBe("unsupported")
    window.dispatchEvent(new Event("focus"))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it("rejects a key of the wrong size and tries again later", async () => {
    vi.useFakeTimers()
    mockFetch.mockResolvedValue({ ID: "key-1", Key: btoa("short") })
    expect(await getDraftKey()).toBeNull()
    expect(draftKeyState()).toBe("waiting")
  })

  it("asks for the key under the browser-wide lock, so two tabs never create two keys", async () => {
    const locks = fakeLocks()
    setLocks(locks)
    const heldDuringFetch: string[][] = []
    mockFetch.mockImplementation(async () => { heldDuringFetch.push([...locks.held]); return { ID: "key-1", Key: KEY } })
    // StrictMode starts twice, the restore asks too: one request in flight.
    startDraftKey()
    startDraftKey()
    const [first, second] = await Promise.all([getDraftKey(), getDraftKey()])
    expect(first?.id).toBe("key-1")
    expect(second).toBe(first)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(locks.request).toHaveBeenCalledTimes(1)
    expect(locks.request).toHaveBeenCalledWith(DRAFT_KEY_LOCK, expect.any(Function))
    expect(heldDuringFetch).toEqual([[DRAFT_KEY_LOCK]])
  })

  it("serializes the requests of two tabs: the second asks only after the first got its answer", async () => {
    const locks = fakeLocks()
    setLocks(locks)
    let release: (value: { ID: string; Key: string }) => void = () => undefined
    mockFetch.mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
    mockFetch.mockResolvedValueOnce({ ID: "key-1", Key: KEY })
    const firstTab = getDraftKey()
    // The other tab: its own module state, the same browser lock.
    const otherTab = locks.request(DRAFT_KEY_LOCK, () => fetchDraftKey())
    await Promise.resolve()
    expect(mockFetch).toHaveBeenCalledTimes(1)
    release({ ID: "key-1", Key: KEY })
    expect((await firstTab)?.id).toBe("key-1")
    await expect(otherTab).resolves.toEqual({ ID: "key-1", Key: KEY })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it("shares one request within the tab when navigator.locks is missing", async () => {
    setLocks(undefined)
    mockFetch.mockResolvedValue({ ID: "key-1", Key: KEY })
    startDraftKey()
    const [first, second] = await Promise.all([getDraftKey(), getDraftKey()])
    expect(second).toBe(first)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
