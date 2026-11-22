import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/api/me/draftKey", () => ({ fetchDraftKey: vi.fn() }))
import { emptyDevice, emptyDraft, emptyTask, emptyVariant } from "@/lib/exerciseSchemas"
import { emptyBootstrap } from "@/lib/editor/schemas/infra"
import { formTask } from "@/test/editorFixtures"
import { fetchDraftKey } from "@/api/me/draftKey"
import { draftKeyState, getDraftKey, resetDraftKeyForTests } from "@/lib/draftKey"
import {
  clearPendingChanges, flushPendingSealing, markPendingBaseline, mergePendingDraft, movePendingChanges, openPendingSecrets, pendingBufferKey,
  PENDING_MAX_AGE_MS, pendingSecretFills, readPendingChanges, resetPendingBufferForTests, sweepPendingChanges, writePendingChanges, type PendingSecrets,
} from "./exercisePendingBuffer"
import type { DraftFormValues } from "@/lib/exerciseSchemas"

const mockFetchDraftKey = vi.mocked(fetchDraftKey)
const keyBase64 = (fill: number) => btoa(String.fromCharCode(...new Uint8Array(32).fill(fill)))

const identity = { Name: "Web 101", Description: "About", Tags: ["web"] }
let storage: Map<string, string>

beforeEach(() => {
  resetDraftKeyForTests()
  resetPendingBufferForTests()
  mockFetchDraftKey.mockReset()
  storage = new Map()
  Object.defineProperty(window, "localStorage", { configurable: true, value: {
    get length() { return storage.size },
    key: (index: number) => [...storage.keys()][index] ?? null,
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
    draft.Variants[0].Tasks[0].Check.Answer.Values = ["ICE{server-secret}"]
    const device = emptyDevice()
    device.Bootstrap.Env = [
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
    expect(restored?.draft.Variants[0].Topology.Devices[0].Bootstrap.Env.map((env) => env.Name)).toEqual(["DB_PASSWORD", "APP_MODE"])
  })

  it("ignores corrupt or foreign entries", () => {
    const key = pendingBufferKey("u1", "e1")
    storage.set(key, "{")
    expect(readPendingChanges(key)).toBeNull()
    storage.set(key, JSON.stringify({ version: 4, identity, draft: emptyDraft(), updatedAt: Date.now() }))
    expect(readPendingChanges(key)).toBeNull()
    // A buffer of the earlier model (tasks with a flag list) is not read.
    storage.set(key, JSON.stringify({ version: 1, identity, draft: emptyDraft(), updatedAt: 1 }))
    expect(readPendingChanges(key)).toBeNull()
    storage.set(key, JSON.stringify({ version: 2, identity, draft: { AdminNote: "", Variants: [] }, updatedAt: 1 }))
    expect(readPendingChanges(key)).toBeNull()
  })

  it("restores a buffer written before linked variants with LinkedTo empty", () => {
    const key = pendingBufferKey("u1", "e1")
    writePendingChanges(key, identity, emptyDraft())
    const entry = JSON.parse(storage.get(key)!)
    delete entry.draft.Variants[0].LinkedTo
    storage.set(key, JSON.stringify(entry))
    expect(readPendingChanges(key)?.draft.Variants[0].LinkedTo).toBe("")
  })

  it("restores a buffer written before variant weights with weight 1", () => {
    const key = pendingBufferKey("u1", "e1")
    writePendingChanges(key, identity, emptyDraft())
    const entry = JSON.parse(storage.get(key)!)
    delete entry.draft.Variants[0].Weight
    storage.set(key, JSON.stringify(entry))
    expect(readPendingChanges(key)?.draft.Variants[0].Weight).toBe(1)
  })

  it("never persists a secret's value group (it means something only within one server answer)", () => {
    const key = pendingBufferKey("u1", "e1")
    const draft = emptyDraft()
    draft.Variants[0].Topology.Devices = [{ ...emptyDevice(), Name: "web", Bootstrap: { ...emptyBootstrap(), Env: [{ Name: "FLAG", Value: "", Secret: true, HasValue: true, ValueGroup: 4 }] } }]
    writePendingChanges(key, identity, draft)
    expect(storage.get(key)).not.toContain("ValueGroup")
  })

  it("gives a plain variable of the server its value back on a restore (the buffer holds none) and keeps a secret blank", () => {
    const key = pendingBufferKey("u1", "e1")
    const server = emptyDraft()
    server.Variants[0].ID = "v1"
    server.Variants[0].Topology.Devices = [{ ...emptyDevice(), ID: "d1", Name: "web", Bootstrap: { ...emptyBootstrap(), Env: [
      { Name: "APP_MODE", Value: "ctf", Secret: false, HasValue: false },
      { Name: "FLAG", Value: "{{task.secret}}", Secret: false, HasValue: false },
      { Name: "LICENSE", Value: "", Secret: true, HasValue: true, ValueGroup: 2 },
    ] } }]
    writePendingChanges(key, identity, server)
    const restored = readPendingChanges(key)!.draft
    expect(restored.Variants[0].Topology.Devices[0].Bootstrap.Env.map((entry) => entry.Value)).toEqual(["", "", ""])
    const merged = mergePendingDraft(server, restored).Variants[0].Topology.Devices[0].Bootstrap.Env
    expect(merged.map((entry) => entry.Value)).toEqual(["ctf", "{{task.secret}}", ""])
    expect(merged[2]).toMatchObject({ Secret: true, HasValue: true })
  })

  it("restores a new secret row typed but never saved as a row without a value (the field then asks for it at publish)", () => {
    const key = pendingBufferKey("u1", "e1")
    const server = emptyDraft()
    server.Variants[0].ID = "v1"
    server.Variants[0].Topology.Devices = [{ ...emptyDevice(), ID: "d1", Name: "web", Bootstrap: emptyBootstrap() }]
    const typed = structuredClone(server)
    typed.Variants[0].Topology.Devices[0].Bootstrap.Env = [{ Name: "API_KEY", Value: "typed-secret", Secret: true, HasValue: false }]
    writePendingChanges(key, identity, typed)
    expect(storage.get(key)).not.toContain("typed-secret")
    const merged = mergePendingDraft(server, readPendingChanges(key)!.draft).Variants[0].Topology.Devices[0].Bootstrap.Env
    expect(merged).toEqual([{ Name: "API_KEY", Value: "", Secret: true, HasValue: false }])
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
    server.Variants[0].Tasks[0] = formTask({ ID: "t1", Name: "Known", flag: ["ICE{kept}"] })
    const pending = structuredClone(server)
    pending.Variants[0].Tasks[0].Check.Answer.Values = []
    pending.Variants[0].Tasks[0].Name = "Edited offline"
    pending.Variants[0].Tasks.push({ ...emptyTask(), Name: "Brand new" })
    const merged = mergePendingDraft(server, pending)
    expect(merged.Variants[0].Tasks[0]).toMatchObject({ Name: "Edited offline", Check: { Answer: { Values: ["ICE{kept}"] } } })
    expect(merged.Variants[0].Tasks[1]).toMatchObject({ Name: "Brand new", Check: { Answer: { Values: [] } } })
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
    device.Bootstrap.Env = [{ Name: "DB_PASSWORD", Value: "", Secret: true, HasValue: true }]
    server.Variants[0].Topology.Devices = [device]
    const pending = structuredClone(server)
    pending.Variants[0].Topology.Devices[0].Bootstrap.Env[0].HasValue = false // stale: buffered before the secret existed
    const merged = mergePendingDraft(server, pending)
    expect(merged.Variants[0].Topology.Devices[0].Bootstrap.Env[0]).toMatchObject({ HasValue: true, Value: "" })
  })

  it("copies flag arrays instead of sharing references with the server draft", () => {
    const server = emptyDraft()
    server.Variants[0].ID = "v1"
    server.Variants[0].Tasks[0] = formTask({ ID: "t1", flag: ["ICE{kept}"] })
    const pending = structuredClone(server)
    const merged = mergePendingDraft(server, pending)
    merged.Variants[0].Tasks[0].Check.Answer.Values.push("mutated")
    expect(server.Variants[0].Tasks[0].Check.Answer.Values).toEqual(["ICE{kept}"])
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

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

const KEY_1 = { ID: "key-1", Key: keyBase64(7) }
const E1 = pendingBufferKey("u1", "e1")

/** A draft with a one-time flag, a device secret and a plain variable; every item has its client key. */
function secretDraft(): DraftFormValues {
  const draft = emptyDraft()
  draft.Variants[0].ID = "v1"
  draft.Variants[0].ClientKey = "cv1"
  draft.Variants[0].Tasks[0] = { ...formTask({ ID: "t1", Name: "Find the flag" }), ClientKey: "ct1" }
  draft.Variants[0].Tasks[0].Check.Answer.Values = ["ICE{one-time-token}"]
  draft.Variants[0].Topology.Devices = [{ ...emptyDevice(), ID: "d1", ClientKey: "cd1", Name: "web", Bootstrap: { ...emptyBootstrap(), Env: [
    { Name: "API_TOKEN", Value: "tok-123-secret", Secret: true, HasValue: true, ClientKey: "ce1" },
    { Name: "APP_MODE", Value: "plain-mode", Secret: false, HasValue: false, ClientKey: "ce2" },
  ] } }]
  return draft
}

/** The server copy of the same draft: its own flag, the secret stored (blank), the plain variable with its stored value. */
function serverDraft(): DraftFormValues {
  const draft = secretDraft()
  draft.Variants[0].Tasks[0].Check.Answer.Values = ["ICE{server}"]
  draft.Variants[0].Topology.Devices[0].Bootstrap.Env = [
    { Name: "API_TOKEN", Value: "", Secret: true, HasValue: true },
    { Name: "APP_MODE", Value: "server-mode", Secret: false, HasValue: false },
  ]
  return draft
}

const values = (draft: DraftFormValues) => ({
  answers: draft.Variants[0].Tasks.map((task) => task.Check.Answer.Values),
  env: draft.Variants[0].Topology.Devices[0]?.Bootstrap.Env.map((entry) => entry.Value) ?? [],
})

async function withKey(response = KEY_1) {
  resetDraftKeyForTests()
  mockFetchDraftKey.mockReset()
  mockFetchDraftKey.mockResolvedValue(response)
  expect(await getDraftKey()).not.toBeNull()
}

async function withoutKey() {
  resetDraftKeyForTests()
  mockFetchDraftKey.mockReset()
  mockFetchDraftKey.mockRejectedValue(new TypeError("Failed to fetch"))
  expect(await getDraftKey()).toBeNull()
}

async function restore(key: string, server: DraftFormValues) {
  await flushPendingSealing()
  const pending = readPendingChanges(key)!
  const opened = await openPendingSecrets(key, pending)
  return { pending, opened, merged: mergePendingDraft(server, pending.draft, opened.status === "open" ? opened.secrets : undefined) }
}

/** Two unsaved tasks (no server id) with their own flags, keyed only by their client keys. */
function unsavedTasksDraft(): DraftFormValues {
  const draft = secretDraft()
  draft.Variants[0].Topology.Devices = []
  draft.Variants[0].Tasks = [
    { ...formTask({ Name: "A", flag: ["ICE{a}"] }), ClientKey: "ta" },
    { ...formTask({ Name: "B", flag: ["ICE{b}"] }), ClientKey: "tb" },
  ]
  return draft
}

describe("exercise pending buffer: sealed secret values", () => {
  it("seals and stores the draft with its sealed part (round trip)", async () => {
    await withKey()
    expect(writePendingChanges(E1, identity, secretDraft())).toBe(true)
    await flushPendingSealing()
    const raw = storage.get(E1)!
    for (const plain of ["ICE{one-time-token}", "tok-123-secret", "plain-mode"]) expect(raw).not.toContain(plain)
    expect(JSON.parse(raw)).toMatchObject({ version: 3, sealed: { keyId: "key-1", iv: expect.any(String), data: expect.any(String) } })
    const { opened, merged } = await restore(E1, serverDraft())
    expect(opened.status).toBe("open")
    expect(values(merged)).toEqual({ answers: [["ICE{one-time-token}"]], env: ["tok-123-secret", "plain-mode"] })
    expect(merged.Variants[0].Topology.Devices[0].Bootstrap.Env[0].HasValue).toBe(true)
  })

  it("updates the entry at once when a secret changes with the key (previous sealed part + stale keys), then seals", async () => {
    await withKey()
    writePendingChanges(E1, identity, secretDraft())
    await flushPendingSealing()
    const before = JSON.parse(storage.get(E1)!).sealed
    const edited = secretDraft()
    edited.Variants[0].Topology.Devices[0].Bootstrap.Env[0].Value = "rotated"
    writePendingChanges(E1, { ...identity, Name: "Renamed" }, edited)
    // Right after the call (a pagehide may come now): the new draft, the previous sealed part, the changed field marked.
    const now = JSON.parse(storage.get(E1)!)
    expect(now.identity.Name).toBe("Renamed")
    expect(now.sealed).toEqual(before)
    expect(now.stale).toEqual([expect.stringContaining("ce1")])
    expect(storage.get(E1)).not.toContain("rotated")
    await flushPendingSealing()
    const sealed = JSON.parse(storage.get(E1)!)
    expect(sealed.sealed.data).not.toBe(before.data)
    expect(sealed.stale).toBeUndefined()
    expect(values((await restore(E1, serverDraft())).merged).env).toEqual(["rotated", "plain-mode"])
  })

  it("never pairs its draft with the sealed part another tab wrote meanwhile", async () => {
    await withKey()
    writePendingChanges(E1, identity, secretDraft())
    await flushPendingSealing()
    // Another tab of the same exercise: its own module state, the same storage and key.
    vi.resetModules()
    const tabB = await import("./exercisePendingBuffer")
    const keyB = await import("@/lib/draftKey")
    vi.mocked((await import("@/api/me/draftKey")).fetchDraftKey).mockResolvedValue(KEY_1)
    await keyB.getDraftKey()
    const other = secretDraft()
    other.Variants[0].Topology.Devices[0].Bootstrap.Env[0].Value = "tok-from-tab-b"
    tabB.writePendingChanges(E1, identity, other)
    await tabB.flushPendingSealing()
    // This tab writes again without changing a secret: the stored sealed part is not the one it wrote.
    writePendingChanges(E1, { ...identity, Name: "Tab A" }, secretDraft())
    expect(JSON.parse(storage.get(E1)!).stale).toEqual(expect.arrayContaining([expect.stringContaining("ce1"), expect.stringContaining("ct1")]))
    await flushPendingSealing()
    const { pending, merged } = await restore(E1, serverDraft())
    expect(pending.identity.Name).toBe("Tab A")
    expect(values(merged)).toEqual({ answers: [["ICE{one-time-token}"]], env: ["tok-123-secret", "plain-mode"] })
  })

  it("marks every field of its draft stale when another tab's sealed part is there and the key is away", async () => {
    await withKey()
    const other = secretDraft()
    other.Variants[0].Topology.Devices[0].Bootstrap.Env[0].Value = "tok-from-tab-b"
    writePendingChanges(E1, identity, other)
    await flushPendingSealing()
    // A new tab that never wrote or restored this entry, without the key.
    resetPendingBufferForTests()
    await withoutKey()
    writePendingChanges(E1, identity, secretDraft())
    resetPendingBufferForTests()
    await withKey()
    const { merged } = await restore(E1, serverDraft())
    expect(values(merged)).toEqual({ answers: [["ICE{server}"]], env: ["", "server-mode"] })
  })

  it("drops only the sealed values when the key of this session is another one (signed out in this browser)", async () => {
    await withKey()
    const draft = secretDraft()
    draft.Variants[0].Tasks[0].Name = "Edited offline"
    writePendingChanges(E1, identity, draft)
    await flushPendingSealing()
    await withKey({ ID: "key-2", Key: keyBase64(9) })
    const { opened, merged } = await restore(E1, serverDraft())
    expect(opened).toEqual({ status: "none" })
    expect(JSON.parse(storage.get(E1)!).sealed).toBeUndefined()
    expect(merged.Variants[0].Tasks[0].Name).toBe("Edited offline")
    expect(values(merged)).toEqual({ answers: [["ICE{server}"]], env: ["", "server-mode"] })
  })

  it("drops the sealed values silently when they cannot be decrypted", async () => {
    await withKey()
    writePendingChanges(E1, identity, secretDraft())
    await flushPendingSealing()
    const entry = JSON.parse(storage.get(E1)!)
    entry.sealed.data = btoa("tampered")
    storage.set(E1, JSON.stringify(entry))
    expect((await restore(E1, serverDraft())).opened).toEqual({ status: "none" })
    expect(readPendingChanges(E1)?.identity).toEqual(identity)
  })

  it("writes nothing secret while the key cannot be fetched, and seals the values once it arrives", async () => {
    vi.useFakeTimers()
    await withoutKey()
    expect(draftKeyState()).toBe("waiting")
    writePendingChanges(E1, identity, secretDraft())
    await flushPendingSealing()
    const raw = storage.get(E1)!
    for (const plain of ["ICE{one-time-token}", "tok-123-secret", "plain-mode"]) expect(raw).not.toContain(plain)
    expect(JSON.parse(raw).sealed).toBeUndefined()
    mockFetchDraftKey.mockResolvedValue(KEY_1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(draftKeyState()).toBe("ready")
    vi.useRealTimers()
    await flushPendingSealing()
    expect(JSON.parse(storage.get(E1)!).sealed?.keyId).toBe("key-1")
    expect(values((await restore(E1, serverDraft())).merged)).toEqual({ answers: [["ICE{one-time-token}"]], env: ["tok-123-secret", "plain-mode"] })
  })

  it("does not write the waiting values after the draft was cleared (saved meanwhile)", async () => {
    vi.useFakeTimers()
    await withoutKey()
    writePendingChanges(E1, identity, secretDraft())
    clearPendingChanges(E1)
    mockFetchDraftKey.mockResolvedValue(KEY_1)
    await vi.advanceTimersByTimeAsync(1000)
    vi.useRealTimers()
    await flushPendingSealing()
    expect(storage.has(E1)).toBe(false)
  })

  it("lets the values follow their unsaved tasks through a reorder and a delete made before the key came back", async () => {
    await withKey()
    const draft = unsavedTasksDraft()
    writePendingChanges(E1, identity, draft)
    await flushPendingSealing()
    await withoutKey()
    // Task B moves first, task A is deleted, a new task C is added in A's old place.
    const edited = { ...draft, Variants: [{ ...draft.Variants[0], Tasks: [draft.Variants[0].Tasks[1], { ...formTask({ Name: "C" }), ClientKey: "tc" }] }] }
    writePendingChanges(E1, identity, edited)
    await withKey()
    const server = serverDraft()
    server.Variants[0].Tasks = []
    const { merged } = await restore(E1, server)
    expect(merged.Variants[0].Tasks.map((task) => [task.Name, task.Check.Answer.Values])).toEqual([["B", ["ICE{b}"]], ["C", []]])
  })

  it("gives nothing to a task the server deleted, and the rest still restores by client key", async () => {
    await withKey()
    const draft = secretDraft()
    draft.Variants[0].Tasks.push({ ...formTask({ ID: "t-gone", Name: "Gone", flag: ["ICE{gone}"] }), ClientKey: "ct-gone" })
    writePendingChanges(E1, identity, draft)
    await flushPendingSealing()
    const { merged } = await restore(E1, serverDraft())
    expect(merged.Variants[0].Tasks.map((task) => task.ID)).toEqual(["t1"])
    expect(values(merged).answers).toEqual([["ICE{one-time-token}"]])
    expect(JSON.stringify(merged)).not.toContain("ICE{gone}")
  })

  it("keeps a secret cleared (and a changed flag unrestored) when the change was made without a key", async () => {
    await withKey()
    writePendingChanges(E1, identity, secretDraft())
    await flushPendingSealing()
    await withoutKey()
    const edited = secretDraft()
    edited.Variants[0].Topology.Devices[0].Bootstrap.Env[0].Value = ""
    edited.Variants[0].Tasks[0].Check.Answer.Values = ["ICE{changed}"]
    writePendingChanges(E1, identity, edited)
    const stored = JSON.parse(storage.get(E1)!)
    expect(stored.sealed?.keyId).toBe("key-1")
    expect(stored.stale).toHaveLength(2)
    expect(storage.get(E1)).not.toContain("ICE{changed}")
    // The next page load, the key is back: the cleared secret stays cleared, the stale flag is not brought back.
    resetPendingBufferForTests()
    await withKey()
    const { merged } = await restore(E1, serverDraft())
    expect(values(merged)).toEqual({ answers: [["ICE{server}"]], env: ["", "plain-mode"] })
  })

  it("keeps the values of two variables with the same name apart", async () => {
    await withKey()
    const draft = secretDraft()
    draft.Variants[0].Topology.Devices[0].Bootstrap.Env = [
      { Name: "TOKEN", Value: "first", Secret: true, HasValue: false, ClientKey: "ce1" },
      { Name: "TOKEN", Value: "second", Secret: true, HasValue: false, ClientKey: "ce2" },
    ]
    writePendingChanges(E1, identity, draft)
    await flushPendingSealing()
    const server = serverDraft()
    server.Variants[0].Topology.Devices[0].Bootstrap.Env = []
    const { merged } = await restore(E1, server)
    expect(values(merged).env).toEqual(["first", "second"])
  })

  it("carries the sealed part of a new task to its exercise: resealed when the key is here", async () => {
    await withKey()
    const NEW = pendingBufferKey("u1", null)
    writePendingChanges(NEW, identity, secretDraft())
    await flushPendingSealing()
    movePendingChanges(NEW, E1, identity, secretDraft())
    await flushPendingSealing()
    expect(storage.has(NEW)).toBe(false)
    expect(values((await restore(E1, serverDraft())).merged)).toEqual({ answers: [["ICE{one-time-token}"]], env: ["tok-123-secret", "plain-mode"] })
  })

  it("moves the new-task entry at once when the task is created without the key, and reseals it after a reload", async () => {
    await withKey()
    const NEW = pendingBufferKey("u1", null)
    writePendingChanges(NEW, identity, secretDraft())
    await flushPendingSealing()
    await withoutKey()
    // The form after the restore holds no secret values yet (they were sealed under the new-task entry).
    const form = secretDraft()
    form.Variants[0].Tasks[0].Check.Answer.Values = []
    form.Variants[0].Topology.Devices[0].Bootstrap.Env.forEach((entry) => { entry.Value = "" })
    markPendingBaseline(NEW, form)
    movePendingChanges(NEW, E1, identity, form)
    // In the same step: the new-task entry is gone, the exercise entry holds its sealed part, sealed for the new-task entry.
    expect(storage.has(NEW)).toBe(false)
    expect(JSON.parse(storage.get(E1)!)).toMatchObject({ sealed: { keyId: "key-1" }, sealedFrom: NEW })
    writePendingChanges(E1, { ...identity, Name: "Renamed" }, form)
    // A reload: nothing of this tab's memory is left; the key is back.
    resetPendingBufferForTests()
    await withKey()
    const { pending, opened, merged } = await restore(E1, serverDraft())
    expect(pending.identity.Name).toBe("Renamed")
    expect(opened.status).toBe("open")
    expect(values(merged)).toEqual({ answers: [["ICE{one-time-token}"]], env: ["tok-123-secret", "plain-mode"] })
    // The restore shows them; the next write seals them for the exercise entry.
    markPendingBaseline(E1, merged)
    writePendingChanges(E1, pending.identity, merged)
    await flushPendingSealing()
    expect(JSON.parse(storage.get(E1)!).sealedFrom).toBeUndefined()
    expect(values((await restore(E1, serverDraft())).merged)).toEqual({ answers: [["ICE{one-time-token}"]], env: ["tok-123-secret", "plain-mode"] })
  })

  it("moves the new-task entry and seals it for the exercise once the key arrives in the same tab", async () => {
    await withKey()
    const NEW = pendingBufferKey("u1", null)
    writePendingChanges(NEW, identity, secretDraft())
    await flushPendingSealing()
    vi.useFakeTimers()
    await withoutKey()
    const form = secretDraft()
    form.Variants[0].Tasks[0].Check.Answer.Values = []
    form.Variants[0].Topology.Devices[0].Bootstrap.Env.forEach((entry) => { entry.Value = "" })
    markPendingBaseline(NEW, form)
    movePendingChanges(NEW, E1, identity, form)
    mockFetchDraftKey.mockResolvedValue(KEY_1)
    await vi.advanceTimersByTimeAsync(1000)
    vi.useRealTimers()
    await flushPendingSealing()
    expect(storage.has(NEW)).toBe(false)
    expect(JSON.parse(storage.get(E1)!).sealedFrom).toBeUndefined()
    expect(values((await restore(E1, serverDraft())).merged)).toEqual({ answers: [["ICE{one-time-token}"]], env: ["tok-123-secret", "plain-mode"] })
  })

  it("does not keep a sealed part that no longer matches the draft when sealing fails", async () => {
    await withKey()
    writePendingChanges(E1, identity, secretDraft())
    await flushPendingSealing()
    vi.spyOn(crypto.subtle, "encrypt").mockRejectedValueOnce(new Error("encrypt failed"))
    const edited = secretDraft()
    edited.Variants[0].Topology.Devices[0].Bootstrap.Env[0].Value = "rotated"
    writePendingChanges(E1, identity, edited)
    await flushPendingSealing()
    const stored = JSON.parse(storage.get(E1)!)
    expect(stored.stale).toEqual([expect.stringContaining("ce1")])
    const { merged } = await restore(E1, serverDraft())
    expect(values(merged)).toEqual({ answers: [["ICE{one-time-token}"]], env: ["", "plain-mode"] })
  })

  it("fills a late-opened value over the shown one unless the author edited that field since the restore", () => {
    const shown = serverDraft()
    markPendingBaseline(E1, shown)
    const secrets: PendingSecrets = { answers: { [JSON.stringify(["a", "cv1", "ct1"])]: ["ICE{typed}"] }, env: { [JSON.stringify(["e", "cv1", "cd1", "ce1"])]: "tok" } }
    shown.Variants[0].Topology.Devices[0].ClientKey = "cd1"
    shown.Variants[0].Topology.Devices[0].Bootstrap.Env[0].ClientKey = "ce1"
    expect(pendingSecretFills(E1, shown, secrets)).toEqual([
      { path: "Variants.0.Tasks.0.Check.Answer.Values", value: ["ICE{typed}"] },
      { path: "Variants.0.Topology.Devices.0.Bootstrap.Env.0.Value", value: "tok" },
    ])
    shown.Variants[0].Tasks[0].Check.Answer.Values = ["ICE{author}"]
    expect(pendingSecretFills(E1, shown, secrets).map((fill) => fill.path)).toEqual(["Variants.0.Topology.Devices.0.Bootstrap.Env.0.Value"])
  })

  it("stops waiting for the key at the restore after about five seconds", async () => {
    await withKey()
    writePendingChanges(E1, identity, secretDraft())
    await flushPendingSealing()
    resetDraftKeyForTests()
    vi.useFakeTimers()
    mockFetchDraftKey.mockReturnValue(new Promise(() => undefined))
    const opened = openPendingSecrets(E1, readPendingChanges(E1)!)
    await vi.advanceTimersByTimeAsync(5000)
    await expect(opened).resolves.toEqual({ status: "later" })
  })

  it("deletes a draft older than two days on read, and the sweep deletes every expired draft of the user", () => {
    const old = Date.now() - PENDING_MAX_AGE_MS - 1
    writePendingChanges(E1, identity, emptyDraft())
    storage.set(E1, JSON.stringify({ ...JSON.parse(storage.get(E1)!), updatedAt: old }))
    expect(readPendingChanges(E1)).toBeNull()
    expect(storage.has(E1)).toBe(false)
    const mine = [pendingBufferKey("u1", "e2"), pendingBufferKey("u1", null)]
    const fresh = pendingBufferKey("u1", "e3")
    const foreign = pendingBufferKey("u2", "e2")
    for (const key of [...mine, fresh, foreign]) writePendingChanges(key, identity, emptyDraft())
    for (const key of [...mine, foreign]) storage.set(key, JSON.stringify({ ...JSON.parse(storage.get(key)!), updatedAt: old }))
    sweepPendingChanges("u1")
    expect(mine.map((key) => storage.has(key))).toEqual([false, false])
    expect(storage.has(fresh)).toBe(true)
    expect(storage.has(foreign)).toBe(true)
  })

  it("keeps reading version 2 entries (no sealed part)", async () => {
    const draft = secretDraft()
    draft.Variants[0].Tasks[0].Check.Answer.Values = []
    draft.Variants[0].Topology.Devices[0].Bootstrap.Env.forEach((entry) => { entry.Value = "" })
    draft.Variants[0].Tasks[0].Name = "Edited in v2"
    storage.set(E1, JSON.stringify({ version: 2, identity, draft, updatedAt: Date.now() }))
    const { pending, opened, merged } = await restore(E1, serverDraft())
    expect(pending.identity).toEqual(identity)
    expect(opened).toEqual({ status: "none" })
    expect(merged.Variants[0].Tasks[0].Name).toBe("Edited in v2")
    expect(values(merged)).toEqual({ answers: [["ICE{server}"]], env: ["", "server-mode"] })
  })
})
