import { beforeEach, describe, expect, it } from "vitest"
import { emptyDevice, emptyDraft, emptyTask, emptyVariant } from "@/lib/exerciseSchemas"
import {
  clearPendingChanges, mergePendingDraft, pendingBufferKey, readPendingChanges, writePendingChanges,
} from "./exercisePendingBuffer"

const identity = { Name: "Web 101", Description: "About", Tags: ["web"] }
let storage: Map<string, string>

beforeEach(() => {
  storage = new Map()
  Object.defineProperty(window, "localStorage", { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, String(value)) },
    removeItem: (key: string) => { storage.delete(key) },
    clear: () => { storage.clear() },
  } })
})

describe("exercise pending buffer", () => {
  it("keys entries per user and exercise, with 'new' before creation", () => {
    expect(pendingBufferKey("u1", "e1")).toBe("cib_exercise_pending_u1_e1")
    expect(pendingBufferKey("u1", null)).toBe("cib_exercise_pending_u1_new")
  })

  it("never writes flag values or environment-variable values", () => {
    const draft = emptyDraft()
    draft.Variants[0].Tasks[0].Flag = ["ICE{server-secret}"]
    const device = emptyDevice()
    device.EnvVars = [
      { Name: "DB_PASSWORD", Value: "hunter2-secret", Secret: true, HasValue: false },
      { Name: "APP_MODE", Value: "plain-env-value", Secret: false, HasValue: false },
    ]
    draft.Variants[0].Topology.Devices = [device]
    const key = pendingBufferKey("u1", "e1")
    expect(writePendingChanges(key, identity, draft)).toBe(true)
    const raw = storage.get(key)!
    expect(raw).not.toContain("ICE{server-secret}")
    expect(raw).not.toContain("hunter2-secret")
    expect(raw).not.toContain("plain-env-value")
    const restored = readPendingChanges(key)
    expect(restored?.identity).toEqual(identity)
    expect(restored?.draft.Variants[0].Topology.Devices[0].EnvVars.map((env) => env.Name)).toEqual(["DB_PASSWORD", "APP_MODE"])
  })

  it("ignores corrupt or foreign entries", () => {
    const key = pendingBufferKey("u1", "e1")
    storage.set(key, "{")
    expect(readPendingChanges(key)).toBeNull()
    storage.set(key, JSON.stringify({ version: 2, identity, draft: emptyDraft(), updatedAt: 1 }))
    expect(readPendingChanges(key)).toBeNull()
    storage.set(key, JSON.stringify({ version: 1, identity, draft: { AdminNote: "", Variants: [] }, updatedAt: 1 }))
    expect(readPendingChanges(key)).toBeNull()
  })

  it("clears an entry", () => {
    const key = pendingBufferKey("u1", "e1")
    writePendingChanges(key, identity, emptyDraft())
    clearPendingChanges(key)
    expect(storage.has(key)).toBe(false)
  })

  it("restores server flag values for known tasks and leaves new tasks without flags", () => {
    const server = emptyDraft()
    server.Variants[0].ID = "v1"
    server.Variants[0].Tasks[0] = { ...emptyTask(), ID: "t1", Name: "Known", Flag: ["ICE{kept}"] }
    const pending = structuredClone(server)
    pending.Variants[0].Tasks[0].Flag = []
    pending.Variants[0].Tasks[0].Name = "Edited offline"
    pending.Variants[0].Tasks.push({ ...emptyTask(), Name: "Brand new" })
    const merged = mergePendingDraft(server, pending)
    expect(merged.Variants[0].Tasks[0]).toMatchObject({ Name: "Edited offline", Flag: ["ICE{kept}"] })
    expect(merged.Variants[0].Tasks[1]).toMatchObject({ Name: "Brand new", Flag: [] })
  })

  it("drops pending variants deleted on the server while keeping ID-less new variants", () => {
    const server = emptyDraft()
    server.Variants[0].ID = "v1"
    const pending = structuredClone(server)
    pending.Variants[0].ID = "v-deleted" // no longer exists server-side
    pending.Variants.push(emptyVariant(2)) // brand new, ID ""
    const merged = mergePendingDraft(server, pending)
    expect(merged.Variants.map((variant) => variant.ID)).toEqual([""])
  })

  it("drops pending tasks deleted on the server while keeping new tasks", () => {
    const server = emptyDraft()
    server.Variants[0].ID = "v1"
    server.Variants[0].Tasks[0] = { ...emptyTask(), ID: "t1", Name: "Known" }
    const pending = structuredClone(server)
    pending.Variants[0].Tasks.push({ ...emptyTask(), ID: "t-deleted", Name: "Removed upstream" })
    pending.Variants[0].Tasks.push({ ...emptyTask(), Name: "Brand new" })
    const merged = mergePendingDraft(server, pending)
    expect(merged.Variants[0].Tasks.map((task) => task.Name)).toEqual(["Known", "Brand new"])
  })

  it("refreshes env-var HasValue from the server copy so a restored secret doesn't fail validation", () => {
    const server = emptyDraft()
    server.Variants[0].ID = "v1"
    const device = emptyDevice()
    device.ID = "d1"
    device.EnvVars = [{ Name: "DB_PASSWORD", Value: "", Secret: true, HasValue: true }]
    server.Variants[0].Topology.Devices = [device]
    const pending = structuredClone(server)
    pending.Variants[0].Topology.Devices[0].EnvVars[0].HasValue = false // stale: buffered before the secret existed
    const merged = mergePendingDraft(server, pending)
    expect(merged.Variants[0].Topology.Devices[0].EnvVars[0]).toMatchObject({ HasValue: true, Value: "" })
  })

  it("copies flag arrays instead of sharing references with the server draft", () => {
    const server = emptyDraft()
    server.Variants[0].ID = "v1"
    server.Variants[0].Tasks[0] = { ...emptyTask(), ID: "t1", Flag: ["ICE{kept}"] }
    const pending = structuredClone(server)
    const merged = mergePendingDraft(server, pending)
    merged.Variants[0].Tasks[0].Flag.push("mutated")
    expect(server.Variants[0].Tasks[0].Flag).toEqual(["ICE{kept}"])
  })

  it("fails safe when localStorage throws on write, read, or clear", () => {
    Object.defineProperty(window, "localStorage", { configurable: true, value: {
      getItem: () => { throw new Error("blocked") },
      setItem: () => { throw new Error("blocked") },
      removeItem: () => { throw new Error("blocked") },
      clear: () => { throw new Error("blocked") },
    } })
    const key = pendingBufferKey("u1", "e1")
    expect(writePendingChanges(key, identity, emptyDraft())).toBe(false)
    expect(readPendingChanges(key)).toBeNull()
    expect(() => clearPendingChanges(key)).not.toThrow()
  })
})
