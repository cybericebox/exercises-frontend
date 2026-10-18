import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"

import { useLeaseClock } from "./useLeaseClock"

const START = Date.parse("2026-10-19T10:00:00Z")
const at = (seconds: number) => new Date(START + seconds * 1000).toISOString()

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(START) })
afterEach(() => { vi.useRealTimers() })

describe("useLeaseClock", () => {
  it("ticks every 30 s over 10 minutes and every second under", () => {
    const { result } = renderHook(() => useLeaseClock([at(15 * 60)], true))
    act(() => { vi.advanceTimersByTime(29000) })
    expect(result.current).toBe(START)
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current).toBe(START + 30000)
    act(() => { vi.advanceTimersByTime(5 * 60000) })
    // 5.5 min in: 9.5 min left, so ticking per second now.
    const mark = result.current
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current).toBe(mark + 1000)
  })

  it("fires onExpired once at zero and then goes idle", () => {
    const onExpired = vi.fn()
    renderHook(() => useLeaseClock([at(2)], true, onExpired))
    act(() => { vi.advanceTimersByTime(1999) })
    expect(onExpired).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(1) })
    expect(onExpired).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("clears its timer when disabled or unmounted", () => {
    const { rerender, unmount } = renderHook(({ on }) => useLeaseClock([at(600)], on), { initialProps: { on: true } })
    expect(vi.getTimerCount()).toBe(1)
    rerender({ on: false })
    expect(vi.getTimerCount()).toBe(0)
    rerender({ on: true })
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("does not tick for an empty list", () => {
    renderHook(() => useLeaseClock([], true))
    expect(vi.getTimerCount()).toBe(0)
  })
})
