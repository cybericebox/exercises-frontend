import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PULSE_INTERVAL_MS, latestPulse, nextDelay, subscribePulse } from "./pulse"

const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock("@/api/client", () => ({ apiGet: api.get }))

const pulses = () => api.get.mock.calls.filter(([path]) => String(path).startsWith("/api/notifications/pulse"))
let visibility: DocumentVisibilityState = "visible"

function setVisibility(next: DocumentVisibilityState) {
  visibility = next
  document.dispatchEvent(new Event("visibilitychange"))
}

describe("pulse loop", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    visibility = "visible"
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility)
    api.get.mockReset()
    api.get.mockResolvedValue({ Banners: "1", Inbox: null })
  })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it("jitters the 30 s interval by +-20%", () => {
    expect(nextDelay(() => 0)).toBe(PULSE_INTERVAL_MS * 0.8)
    expect(nextDelay(() => 0.5)).toBe(PULSE_INTERVAL_MS)
    expect(nextDelay(() => 1)).toBe(PULSE_INTERVAL_MS * 1.2)
  })

  it("pulses at once, then every 30 s +-20%, with the site and without no-store", async () => {
    const listener = vi.fn()
    const stop = subscribePulse(listener)
    await vi.advanceTimersByTimeAsync(0)
    expect(pulses()).toHaveLength(1)
    expect(api.get).toHaveBeenCalledWith("/api/notifications/pulse?site=exercises", undefined, { required: false })
    await vi.advanceTimersByTimeAsync(PULSE_INTERVAL_MS * 0.8 - 1)
    expect(pulses()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(PULSE_INTERVAL_MS * 0.4 + 2)
    expect(pulses()).toHaveLength(2)
    expect(listener).toHaveBeenCalledWith({ Banners: "1", Inbox: null })
    stop()
  })

  it("shares one loop between subscribers and replays the last pulse", async () => {
    const first = vi.fn()
    const stopFirst = subscribePulse(first)
    await vi.advanceTimersByTimeAsync(0)
    const second = vi.fn()
    const stopSecond = subscribePulse(second)
    expect(second).toHaveBeenCalledWith({ Banners: "1", Inbox: null })
    expect(pulses()).toHaveLength(1)
    stopFirst(); stopSecond()
    expect(latestPulse()).toBeNull()
  })

  it("scopes the pulse to an event", async () => {
    const stop = subscribePulse(vi.fn(), "e1")
    await vi.advanceTimersByTimeAsync(0)
    expect(api.get).toHaveBeenCalledWith("/api/notifications/pulse?site=exercises&event=e1", undefined, { required: false })
    stop()
  })

  it("pauses while hidden and pulses once on becoming visible", async () => {
    const stop = subscribePulse(vi.fn())
    await vi.advanceTimersByTimeAsync(0)
    setVisibility("hidden")
    await vi.advanceTimersByTimeAsync(PULSE_INTERVAL_MS * 3)
    expect(pulses()).toHaveLength(1)
    setVisibility("visible")
    await vi.advanceTimersByTimeAsync(0)
    expect(pulses()).toHaveLength(2)
    stop()
  })

  it("wakes on focus and online at most once per 5 s", async () => {
    const stop = subscribePulse(vi.fn())
    await vi.advanceTimersByTimeAsync(0)
    window.dispatchEvent(new Event("focus"))
    window.dispatchEvent(new Event("online"))
    await vi.advanceTimersByTimeAsync(0)
    expect(pulses()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(5_000)
    window.dispatchEvent(new Event("focus"))
    window.dispatchEvent(new Event("online"))
    await vi.advanceTimersByTimeAsync(0)
    expect(pulses()).toHaveLength(2)
    stop()
  })

  it("survives a failed pulse and tries again", async () => {
    api.get.mockRejectedValueOnce(new Error("down"))
    const listener = vi.fn()
    const stop = subscribePulse(listener)
    await vi.advanceTimersByTimeAsync(PULSE_INTERVAL_MS * 1.3)
    expect(pulses()).toHaveLength(2)
    expect(listener).toHaveBeenCalledTimes(1)
    stop()
  })

  it("stops pulsing after the last unsubscribe", async () => {
    const stop = subscribePulse(vi.fn())
    await vi.advanceTimersByTimeAsync(0)
    stop()
    await vi.advanceTimersByTimeAsync(PULSE_INTERVAL_MS * 3)
    expect(pulses()).toHaveLength(1)
  })
})
