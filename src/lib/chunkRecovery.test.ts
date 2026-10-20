import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {CHUNK_RECOVERY_BOOT_SCRIPT, installChunkRecovery} from "./chunkRecovery"

function browser(storage = new Map<string, string>()) {
  const listeners = new Map<string, EventListener[]>()
  const reload = vi.fn()
  const win = {
    location: {href: "https://catalog.example/tasks?q=term#task", origin: "https://catalog.example", reload},
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value) },
    },
    addEventListener: (name: string, listener: EventListener) => {
      listeners.set(name, [...(listeners.get(name) ?? []), listener])
    },
  }
  return {
    win: win as unknown as Window,
    reload,
    storage,
    emit: (name: string, event: object) => listeners.get(name)?.forEach(listener => listener(event as Event)),
  }
}
const chunkError = () => Object.assign(new Error("Loading chunk 42 failed."), {name: "ChunkLoadError"})

afterEach(() => vi.restoreAllMocks())

describe("stale chunk recovery", () => {
  beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000) })

  it("writes the guard before reloading the complete current URL once", () => {
    const {win, reload, storage} = browser()
    reload.mockImplementation(() => { expect([...storage.values()]).toEqual(["1800000000000"]) })
    const recovery = installChunkRecovery(win)
    expect(recovery.recover(chunkError())).toBe(true)
    expect(recovery.recover(chunkError())).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(win.location.href).toBe("https://catalog.example/tasks?q=term#task")
  })

  it("shares the guard between global events, boundaries and repeated bootstrap installation", () => {
    const {win, emit, reload} = browser()
    const first = installChunkRecovery(win)
    expect(installChunkRecovery(win)).toBe(first)
    emit("unhandledrejection", {reason: chunkError()})
    emit("error", {error: chunkError()})
    expect(first.recover(chunkError())).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it("persists the guard across reloads and reports a repeat to the shared error boundary", () => {
    const storage = new Map<string, string>()
    const before = browser(storage)
    installChunkRecovery(before.win).recover(chunkError())
    const after = browser(storage)
    const recovery = installChunkRecovery(after.win)
    const failed = vi.fn()
    recovery.subscribe(failed)
    after.emit("unhandledrejection", {reason: chunkError()})
    after.emit("error", {error: chunkError()})
    expect(failed).toHaveBeenCalledTimes(1)
    expect(after.reload).not.toHaveBeenCalled()
    expect(failed.mock.calls[0][0].name).toBe("ChunkLoadError")
    const lateSubscriber = vi.fn()
    recovery.subscribe(lateSubscriber)
    expect(lateSubscriber).toHaveBeenCalledTimes(1)
  })

  it("allows a later deployment failure after the quiet period, but only once per document", () => {
    const storage = new Map<string, string>()
    const first = browser(storage)
    installChunkRecovery(first.win).recover(chunkError())
    vi.mocked(Date.now).mockReturnValue(1_800_000_061_000)
    expect(installChunkRecovery(first.win).recover(chunkError())).toBe(false)
    const later = browser(storage)
    expect(installChunkRecovery(later.win).recover(chunkError())).toBe(true)
    expect(later.reload).toHaveBeenCalledTimes(1)
  })

  it.each(["getItem", "setItem"] as const)("does not reload if sessionStorage.%s throws", method => {
    const {win, reload} = browser()
    win.sessionStorage[method] = () => { throw new Error("storage disabled") }
    const recovery = installChunkRecovery(win)
    expect(recovery.recover(chunkError())).toBe(false)
    expect(recovery.recover(chunkError())).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it.each([
    new Error("Failed to fetch"),
    new Error("NetworkError when attempting to fetch resource."),
    new Error("Cannot read properties of undefined"),
    {status: 404, message: "API request failed"},
    null,
    "ordinary error",
    new TypeError("Failed to fetch dynamically imported module: https://third-party.example/widget.js"),
  ])("leaves ordinary API, network, runtime and external module errors alone: %s", error => {
    const {win, reload, emit} = browser()
    const recovery = installChunkRecovery(win)
    const failed = vi.fn()
    recovery.subscribe(failed)
    expect(recovery.recover(error)).toBe(false)
    emit("unhandledrejection", {reason: error})
    emit("error", {error})
    expect(reload).not.toHaveBeenCalled()
    expect(failed).not.toHaveBeenCalled()
  })

  it.each([
    new TypeError("Failed to fetch dynamically imported module: https://catalog.example/_next/static/chunks/old.js"),
    new TypeError("error loading dynamically imported module: https://catalog.example/_next/static/chunks/old.js"),
    new TypeError("Importing a module script failed."),
    new Error("Failed to load chunk /_next/static/chunks/old.js from module 42"),
  ])("recovers recognized browser dynamic-import and Next chunk failures: %s", error => {
    const {win, reload} = browser()
    expect(installChunkRecovery(win).recover(error)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it("catches missing same-origin Next scripts before React mounts; ignores unrelated resources", () => {
    const {win, emit, reload} = browser()
    installChunkRecovery(win)
    for (const [tagName, src] of [
      ["IMG", "https://catalog.example/_next/static/chunks/missing.js"],
      ["SCRIPT", "https://third-party.example/_next/static/chunks/missing.js"],
      ["SCRIPT", "https://catalog.example/analytics.js"],
      ["SCRIPT", "https://catalog.example/_next/static/chunks/missing.css"],
    ]) emit("error", {target: {tagName, src}})
    expect(reload).not.toHaveBeenCalled()
    emit("error", {target: {tagName: "SCRIPT", src: "https://catalog.example/_next/static/chunks/missing.js?v=old"}})
    expect(reload).toHaveBeenCalledTimes(1)
  })


  it("recovers a missing initial Next script that finished before the bootstrap installed", () => {
    const {win, reload} = browser()
    Object.defineProperty(win, "performance", {value: {getEntriesByType: () => [
      {name: "https://catalog.example/_next/static/chunks/runtime.js", initiatorType: "script", responseStatus: 404},
    ]}})
    new Function("window", CHUNK_RECOVERY_BOOT_SCRIPT)(win)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(installChunkRecovery(win).recover(chunkError())).toBe(false)
  })

  it("does not infer failed scripts from successful or unknown-status timing entries", () => {
    const {win, reload} = browser()
    Object.defineProperty(win, "performance", {value: {getEntriesByType: () => [
      {name: "https://catalog.example/_next/static/chunks/good.js", initiatorType: "script", responseStatus: 200},
      {name: "https://catalog.example/_next/static/chunks/cached.js", initiatorType: "script", responseStatus: 0},
      {name: "https://catalog.example/_next/static/chunks/unknown.js", initiatorType: "script"},
      {name: "https://catalog.example/api/tasks", initiatorType: "fetch", responseStatus: 404},
      {name: "https://catalog.example/_next/static/chunks/image.js", initiatorType: "img", responseStatus: 404},
      {name: "https://external.example/_next/static/chunks/runtime.js", initiatorType: "script", responseStatus: 404},
      {name: "https://catalog.example/analytics.js", initiatorType: "script", responseStatus: 500},
    ]}})
    installChunkRecovery(win)
    expect(reload).not.toHaveBeenCalled()
  })

  it.each([400, 410])("observes buffered HTTP %i scripts without reloading again for observer/event duplicates", status => {
    const {win, reload, emit} = browser()
    let deliver: ((list: {getEntries: () => object[]}) => void) | undefined
    Object.defineProperty(win, "PerformanceObserver", {value: class {
      constructor(callback: typeof deliver) { deliver = callback }
      observe() {}
    }})
    installChunkRecovery(win)
    deliver?.({getEntries: () => [
      {name: "https://catalog.example/_next/static/chunks/runtime.js", initiatorType: "script", responseStatus: status},
    ]})
    expect(reload).toHaveBeenCalledTimes(1)
    emit("error", {target: {tagName: "SCRIPT", src: "https://catalog.example/_next/static/chunks/runtime.js"}})
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it("preserves the persisted guard when a reloaded document reports the same buffered failure", () => {
    const storage = new Map<string, string>()
    const first = browser(storage)
    installChunkRecovery(first.win).recover(chunkError())
    const after = browser(storage)
    Object.defineProperty(after.win, "performance", {value: {getEntriesByType: () => [
      {name: "https://catalog.example/_next/static/chunks/runtime.js", initiatorType: "script", responseStatus: 404},
    ]}})
    const recovery = installChunkRecovery(after.win)
    const failed = vi.fn()
    recovery.subscribe(failed)
    expect(after.reload).not.toHaveBeenCalled()
    expect(failed).toHaveBeenCalledTimes(1)
    expect(failed.mock.calls[0][0].name).toBe("ChunkLoadError")
  })

  it("retains synchronous error recovery if timing inspection and observer installation are unavailable", () => {
    const {win, reload, emit} = browser()
    Object.defineProperty(win, "performance", {value: {getEntriesByType: () => {throw new Error("unsupported")}}})
    Object.defineProperty(win, "PerformanceObserver", {value: class {
      observe() {throw new Error("unsupported")}
    }})
    installChunkRecovery(win)
    emit("error", {target: {tagName: "SCRIPT", src: "https://catalog.example/_next/static/chunks/runtime.js"}})
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it("allows an explicit manual reload after automatic recovery is exhausted, preserving its guard", () => {
    const {win, reload, storage} = browser()
    const recovery = installChunkRecovery(win)
    recovery.recover(chunkError())
    const fallback = vi.fn()
    recovery.retry(chunkError(), fallback)
    expect(reload).toHaveBeenCalledTimes(2)
    expect(fallback).not.toHaveBeenCalled()
    expect([...storage.values()]).toEqual(["1800000000000"])
    expect(recovery.recover(chunkError())).toBe(false)
    recovery.retry(new Error("ordinary runtime failure"), fallback)
    expect(fallback).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it("executes the emitted head bootstrap independently, before any application modules", () => {
    const {win, emit, reload} = browser()
    new Function("window", CHUNK_RECOVERY_BOOT_SCRIPT)(win)
    emit("unhandledrejection", {reason: chunkError()})
    expect(reload).toHaveBeenCalledTimes(1)
    expect(installChunkRecovery(win).recover(chunkError())).toBe(false)
  })
})
