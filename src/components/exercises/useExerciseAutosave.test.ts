import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { useExerciseAutosave, type UseExerciseAutosaveOptions } from "./useExerciseAutosave"

function setup(overrides: Partial<UseExerciseAutosaveOptions> = {}) {
  const options: UseExerciseAutosaveOptions = {
    save: vi.fn().mockResolvedValue(true),
    onSaved: vi.fn(),
    writeBuffer: vi.fn(),
    clearBuffer: vi.fn(),
    sendKeepalive: vi.fn(),
    ...overrides,
  }
  const hook = renderHook(() => useExerciseAutosave(options))
  return { options, hook }
}

function setVisibility(state: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state })
}

describe("useExerciseAutosave", () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); setVisibility("visible") })

  it("buffers a change quickly, saves after one second, then clears the buffer", async () => {
    const { options, hook } = setup()
    act(() => hook.result.current.markChanged())
    expect(hook.result.current.status).toBe("pending")
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(options.writeBuffer).toHaveBeenCalledTimes(1)
    expect(options.save).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(700) })
    expect(options.save).toHaveBeenCalledTimes(1)
    expect(options.clearBuffer).toHaveBeenCalledTimes(1)
    expect(options.onSaved).toHaveBeenCalledTimes(1)
    expect(hook.result.current.status).toBe("saved")
  })

  it("keeps the buffer and reports an error when saving fails", async () => {
    const { options, hook } = setup({ save: vi.fn().mockRejectedValue(new Error("offline")) })
    act(() => hook.result.current.markChanged())
    let ok = true
    await act(async () => { ok = await hook.result.current.flush() })
    expect(ok).toBe(false)
    expect(hook.result.current.status).toBe("error")
    expect(options.writeBuffer).toHaveBeenCalled()
    expect(options.clearBuffer).not.toHaveBeenCalled()
  })

  it("flushes as soon as the tab is hidden", async () => {
    const { options, hook } = setup()
    act(() => hook.result.current.markChanged())
    setVisibility("hidden")
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); await Promise.resolve() })
    expect(options.writeBuffer).toHaveBeenCalled()
    expect(options.save).toHaveBeenCalledTimes(1)
  })

  it("writes the buffer and sends a keepalive request on pagehide", () => {
    const { options, hook } = setup()
    act(() => hook.result.current.markChanged())
    window.dispatchEvent(new Event("pagehide"))
    expect(options.writeBuffer).toHaveBeenCalledTimes(1)
    expect(options.sendKeepalive).toHaveBeenCalledTimes(1)
  })

  it("ignores pagehide when everything is saved", () => {
    const { options } = setup()
    window.dispatchEvent(new Event("pagehide"))
    expect(options.sendKeepalive).not.toHaveBeenCalled()
  })

  it("discard forgets the changes and clears the buffer", async () => {
    const { options, hook } = setup()
    act(() => hook.result.current.markChanged())
    await act(async () => { await hook.result.current.discard() })
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(options.save).not.toHaveBeenCalled()
    expect(options.clearBuffer).toHaveBeenCalledTimes(1)
    expect(hook.result.current.hasUnsaved()).toBe(false)
  })

  it("discard while a save is in flight leaves status idle and does not call onSaved once the save settles", async () => {
    let resolveSave: (value: boolean) => void = () => {}
    const save = vi.fn().mockImplementation(() => new Promise<boolean>((resolve) => { resolveSave = resolve }))
    const { options, hook } = setup({ save })
    act(() => hook.result.current.markChanged())
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(options.save).toHaveBeenCalledTimes(1)
    expect(hook.result.current.status).toBe("saving")

    let discardResolved = false
    let discardPromise!: Promise<void>
    act(() => { discardPromise = hook.result.current.discard().then(() => { discardResolved = true }) })
    expect(discardResolved).toBe(false)

    await act(async () => {
      resolveSave(true)
      await discardPromise
    })

    expect(hook.result.current.status).toBe("idle")
    expect(options.onSaved).not.toHaveBeenCalled()
  })

  it("flushes an unsaved change on unmount", async () => {
    const { options, hook } = setup()
    act(() => hook.result.current.markChanged())
    await act(async () => { hook.unmount() })
    expect(options.writeBuffer).toHaveBeenCalled()
    expect(options.save).toHaveBeenCalledTimes(1)
  })

  it("lets a save already in flight at unmount finish and still applies its result", async () => {
    let resolveSave: (value: boolean) => void = () => {}
    const save = vi.fn().mockImplementation(() => new Promise<boolean>((resolve) => { resolveSave = resolve }))
    const { options, hook } = setup({ save })
    act(() => hook.result.current.markChanged())
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(options.save).toHaveBeenCalledTimes(1)

    act(() => { hook.unmount() })
    expect(options.onSaved).not.toHaveBeenCalled()

    await act(async () => {
      resolveSave(true)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(options.clearBuffer).toHaveBeenCalled()
    expect(options.onSaved).toHaveBeenCalledTimes(1)
  })
})
