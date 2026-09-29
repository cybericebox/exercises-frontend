import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AutosaveQueue, type AutosaveStatus } from "./autosaveQueue"

function deferred() {
  let resolve!: (value: boolean) => void
  const promise = new Promise<boolean>((res) => { resolve = res })
  return { promise, resolve }
}

function deferredRejectable() {
  let resolve!: (value: boolean) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<boolean>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe("AutosaveQueue", () => {
  let statuses: AutosaveStatus[]
  beforeEach(() => { vi.useFakeTimers(); statuses = [] })
  afterEach(() => { vi.useRealTimers() })

  function createQueue(save: () => Promise<boolean>, onSaved = vi.fn()) {
    return new AutosaveQueue({ delayMs: 1000, save, onStatus: (status) => statuses.push(status), onSaved })
  }

  it("debounces a burst of changes into one save one second after the last change", async () => {
    const save = vi.fn().mockResolvedValue(true)
    const onSaved = vi.fn()
    const queue = createQueue(save, onSaved)
    queue.markChanged()
    await vi.advanceTimersByTimeAsync(600)
    queue.markChanged()
    await vi.advanceTimersByTimeAsync(999)
    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(statuses.at(-1)).toBe("saved")
    expect(queue.hasUnsaved()).toBe(false)
  })

  it("never overlaps requests and folds changes made in flight into one follow-up", async () => {
    const first = deferred()
    let calls = 0
    let active = 0
    let maxActive = 0
    const save = vi.fn(async () => {
      calls += 1
      active += 1
      maxActive = Math.max(maxActive, active)
      const result = calls === 1 ? await first.promise : true
      active -= 1
      return result
    })
    const queue = createQueue(save)
    queue.markChanged()
    const flushed = queue.flush()
    expect(save).toHaveBeenCalledTimes(1)
    queue.markChanged()
    queue.markChanged()
    queue.markChanged()
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).toHaveBeenCalledTimes(1)
    first.resolve(true)
    await expect(flushed).resolves.toBe(true)
    expect(save).toHaveBeenCalledTimes(2)
    expect(maxActive).toBe(1)
  })

  it("flush sends immediately and resolves true without changes", async () => {
    const save = vi.fn().mockResolvedValue(true)
    const queue = createQueue(save)
    await expect(queue.flush()).resolves.toBe(true)
    expect(save).not.toHaveBeenCalled()
    queue.markChanged()
    await expect(queue.flush()).resolves.toBe(true)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it("reports an error, keeps the changes, and retries on the next flush", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(true)
    const queue = createQueue(save)
    queue.markChanged()
    await expect(queue.flush()).resolves.toBe(false)
    expect(statuses.at(-1)).toBe("error")
    expect(queue.hasUnsaved()).toBe(true)
    await expect(queue.flush()).resolves.toBe(true)
    expect(save).toHaveBeenCalledTimes(2)
  })

  it("keeps changes pending when there is nothing to persist yet", async () => {
    const save = vi.fn().mockResolvedValue(false)
    const queue = createQueue(save)
    queue.markChanged()
    await expect(queue.flush()).resolves.toBe(false)
    expect(statuses.at(-1)).toBe("idle")
    expect(queue.hasUnsaved()).toBe(true)
  })

  it("discard drops pending changes and the timer", async () => {
    const save = vi.fn().mockResolvedValue(true)
    const queue = createQueue(save)
    queue.markChanged()
    queue.discard()
    await vi.advanceTimersByTimeAsync(2000)
    expect(save).not.toHaveBeenCalled()
    expect(queue.hasUnsaved()).toBe(false)
  })

  it("discard during a failing save reports no dirty and no error status for the discarded generation", async () => {
    const inFlight = deferredRejectable()
    const save = vi.fn(() => inFlight.promise)
    const queue = createQueue(save)
    queue.markChanged()
    const flushed = queue.flush()
    const discarded = queue.discard()
    inFlight.reject(new Error("offline"))
    await discarded
    await expect(flushed).resolves.toBe(true)
    expect(statuses).not.toContain("error")
    expect(queue.hasUnsaved()).toBe(false)
  })

  it("discard during a successful save suppresses onSaved and the 'saved' status for the discarded generation", async () => {
    const inFlight = deferred()
    const onSaved = vi.fn()
    const save = vi.fn(() => inFlight.promise)
    const queue = createQueue(save, onSaved)
    queue.markChanged()
    const flushed = queue.flush()
    const discarded = queue.discard()
    inFlight.resolve(true)
    await discarded
    await expect(flushed).resolves.toBe(true)
    expect(onSaved).not.toHaveBeenCalled()
    expect(statuses).not.toContain("saved")
    expect(queue.hasUnsaved()).toBe(false)
  })

  it("await discard() waits for the in-flight save to settle", async () => {
    const inFlight = deferred()
    const save = vi.fn(() => inFlight.promise)
    const queue = createQueue(save)
    queue.markChanged()
    queue.flush()
    let settled = false
    const discardPromise = queue.discard().then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)
    inFlight.resolve(true)
    await discardPromise
    expect(settled).toBe(true)
  })

  it("dispose clears a pending timer and makes further scheduled/queued work a no-op", async () => {
    const save = vi.fn().mockResolvedValue(true)
    const queue = createQueue(save)
    queue.markChanged()
    queue.dispose()
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).not.toHaveBeenCalled()
    queue.markChanged()
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).not.toHaveBeenCalled()
    await expect(queue.flush()).resolves.toBe(true)
    expect(save).not.toHaveBeenCalled()
  })

  it("never re-emits 'pending' while a save is in flight — a coalesced run reports saving, saving, saved", async () => {
    const first = deferred()
    let calls = 0
    const save = vi.fn(async () => {
      calls += 1
      if (calls === 1) return first.promise
      return true
    })
    const queue = createQueue(save)
    queue.markChanged()
    queue.flush()
    statuses.length = 0 // drop the initial "pending"/"saving" from markChanged()+flush(); observe only what follows
    queue.markChanged()
    queue.markChanged()
    first.resolve(true)
    await vi.advanceTimersByTimeAsync(5000)
    expect(statuses).toEqual(["saving", "saved"])
  })

  it("a scheduled flush that throws synchronously does not produce an unhandled rejection", async () => {
    const save = vi.fn().mockRejectedValue(new Error("boom"))
    const queue = createQueue(save)
    queue.markChanged()
    await vi.advanceTimersByTimeAsync(1000)
    expect(statuses.at(-1)).toBe("error")
    expect(queue.hasUnsaved()).toBe(true)
  })
})
