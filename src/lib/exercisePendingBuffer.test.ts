import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/api/me/draftKey", () => ({ fetchDraftKey: vi.fn() }))
import { emptyDevice, emptyDraft, emptyTask, emptyVariant } from "@/lib/exerciseSchemas"
import { emptyBootstrap } from "@/lib/editor/schemas/infra"
import { formTask } from "@/test/editorFixtures"
import { fetchDraftKey } from "@/api/me/draftKey"
import { draftKeyState, getDraftKey, resetDraftKeyForTests } from "@/lib/draftKey"
import {
  clearPendingChanges, flushPendingSealing, mergePendingDraft, openPendingSecrets, pendingBufferKey, PENDING_MAX_AGE_MS, readPendingChanges,
  sweepPendingChanges, writePendingChanges,
} from "./exercisePendingBuffer"

const mockFetchDraftKey = vi.mocked(fetchDraftKey)
const keyBase64 = (fill: number) => btoa(String.fromCharCode(...new Uint8Array(32).fill(fill)))

const identity = { Name: "Web 101", Description: "About", Tags: ["web"] }
let storage: Map<string, string>

beforeEach(() => {
  resetDraftKeyForTests()
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

afterEach(() => { vi.useRealTimers() })

/** A draft with a one-time flag, a device secret and a plain variable (ids as the server gave them). */
function secretDraft() {
  const draft = emptyDraft()
  draft.Variants[0].ID = "v1"
  draft.Variants[0].Tasks[0] = { ...formTask({ ID: "t1", Name: "Find the flag" }) }
  draft.Variants[0].Tasks[0].Check.Answer.Values = ["ICE{one-time-token}"]
  draft.Variants[0].Topology.Devices = [{ ...emptyDevice(), ID: "d1", Name: "web", Bootstrap: { ...emptyBootstrap(), Env: [
    { Name: "API_TOKEN", Value: "tok-123-secret", Secret: true, HasValue: true },
    { Name: "APP_MODE", Value: "plain-mode", Secret: false, HasValue: false },
  ] } }]
  return draft
}

/** The server copy of the same draft: its own flag, the secret stored (blank), the plain variable with its stored value. */
function serverDraft() {
  const draft = secretDraft()
  draft.Variants[0].Tasks[0].Check.Answer.Values = ["ICE{server}"]
  draft.Variants[0].Topology.Devices[0].Bootstrap.Env = [
    { Name: "API_TOKEN", Value: "", Secret: true, HasValue: true },
    { Name: "APP_MODE", Value: "server-mode", Secret: false, HasValue: false },
  ]
  return draft
}

const values = (draft: ReturnType<typeof emptyDraft>) => ({
  answers: draft.Variants[0].Tasks[0].Check.Answer.Values,
  env: draft.Variants[0].Topology.Devices[0].Bootstrap.Env.map((entry) => entry.Value),
})

describe("exercise pending buffer: sealed secret values", () => {
  it("seals flag and environment values with the session key and opens them again (round trip)", async () => {
    mockFetchDraftKey.mockResolvedValue({ ID: "key-1", Key: keyBase64(7) })
    expect(await getDraftKey()).not.toBeNull()
    const key = pendingBufferKey("u1", "e1")
    expect(writePendingChanges(key, identity, secretDraft())).toBe(true)
    await flushPendingSealing()
    const raw = storage.get(key)!
    for (const plain of ["ICE{one-time-token}", "tok-123-secret", "plain-mode"]) expect(raw).not.toContain(plain)
    const entry = JSON.parse(raw)
    expect(entry.version).toBe(3)
    expect(entry.sealed).toMatchObject({ keyId: "key-1", iv: expect.any(String), data: expect.any(String) })
    const pending = readPendingChanges(key)!
    const opened = await openPendingSecrets(key, pending)
    expect(opened.status).toBe("open")
    // The buffered values win over the server copy for those fields.
    const merged = mergePendingDraft(serverDraft(), pending.draft, opened.status === "open" ? opened.secrets : undefined)
    expect(values(merged)).toEqual({ answers: ["ICE{one-time-token}"], env: ["tok-123-secret", "plain-mode"] })
    expect(merged.Variants[0].Topology.Devices[0].Bootstrap.Env[0].HasValue).toBe(true)
  })

  it("drops only the sealed values when the key of this session is another one (signed out in this browser)", async () => {
    mockFetchDraftKey.mockResolvedValue({ ID: "key-1", Key: keyBase64(7) })
    await getDraftKey()
    const key = pendingBufferKey("u1", "e1")
    const draft = secretDraft()
    draft.Variants[0].Tasks[0].Name = "Edited offline"
    writePendingChanges(key, identity, draft)
    await flushPendingSealing()

    resetDraftKeyForTests()
    mockFetchDraftKey.mockResolvedValue({ ID: "key-2", Key: keyBase64(9) })
    const pending = readPendingChanges(key)!
    expect(await openPendingSecrets(key, pending)).toEqual({ status: "none" })
    expect(JSON.parse(storage.get(key)!).sealed).toBeUndefined()
    const merged = mergePendingDraft(serverDraft(), pending.draft)
    expect(merged.Variants[0].Tasks[0].Name).toBe("Edited offline")
    expect(values(merged)).toEqual({ answers: ["ICE{server}"], env: ["", "server-mode"] })
  })

  it("drops the sealed values silently when they cannot be decrypted", async () => {
    mockFetchDraftKey.mockResolvedValue({ ID: "key-1", Key: keyBase64(7) })
    await getDraftKey()
    const key = pendingBufferKey("u1", "e1")
    writePendingChanges(key, identity, secretDraft())
    await flushPendingSealing()
    const entry = JSON.parse(storage.get(key)!)
    entry.sealed.data = btoa("tampered")
    storage.set(key, JSON.stringify(entry))
    const pending = readPendingChanges(key)!
    expect(await openPendingSecrets(key, pending)).toEqual({ status: "none" })
    expect(readPendingChanges(key)?.identity).toEqual(identity)
  })

  it("writes nothing secret while the key cannot be fetched, and seals the values once it arrives", async () => {
    vi.useFakeTimers()
    mockFetchDraftKey.mockRejectedValue(new TypeError("Failed to fetch"))
    expect(await getDraftKey()).toBeNull()
    expect(draftKeyState()).toBe("waiting")
    const key = pendingBufferKey("u1", "e1")
    writePendingChanges(key, identity, secretDraft())
    await flushPendingSealing()
    const raw = storage.get(key)!
    for (const plain of ["ICE{one-time-token}", "tok-123-secret", "plain-mode"]) expect(raw).not.toContain(plain)
    expect(JSON.parse(raw).sealed).toBeUndefined()

    mockFetchDraftKey.mockResolvedValue({ ID: "key-1", Key: keyBase64(7) })
    await vi.advanceTimersByTimeAsync(1000)
    expect(draftKeyState()).toBe("ready")
    vi.useRealTimers()
    await flushPendingSealing()
    const entry = JSON.parse(storage.get(key)!)
    expect(entry.sealed?.keyId).toBe("key-1")
    const opened = await openPendingSecrets(key, readPendingChanges(key)!)
    expect(opened.status === "open" && opened.secrets).toBeTruthy()
    expect(values(mergePendingDraft(serverDraft(), readPendingChanges(key)!.draft, opened.status === "open" ? opened.secrets : undefined)))
      .toEqual({ answers: ["ICE{one-time-token}"], env: ["tok-123-secret", "plain-mode"] })
  })

  it("does not write the waiting values after the draft was cleared (saved meanwhile)", async () => {
    vi.useFakeTimers()
    mockFetchDraftKey.mockRejectedValue(new TypeError("Failed to fetch"))
    await getDraftKey()
    const key = pendingBufferKey("u1", "e1")
    writePendingChanges(key, identity, secretDraft())
    clearPendingChanges(key)
    mockFetchDraftKey.mockResolvedValue({ ID: "key-1", Key: keyBase64(7) })
    await vi.advanceTimersByTimeAsync(1000)
    vi.useRealTimers()
    await flushPendingSealing()
    expect(storage.has(key)).toBe(false)
  })

  it("deletes a draft older than two days on read, and the sweep deletes every expired draft of the user", () => {
    const old = Date.now() - PENDING_MAX_AGE_MS - 1
    const stale = pendingBufferKey("u1", "e1")
    writePendingChanges(stale, identity, emptyDraft())
    storage.set(stale, JSON.stringify({ ...JSON.parse(storage.get(stale)!), updatedAt: old }))
    expect(readPendingChanges(stale)).toBeNull()
    expect(storage.has(stale)).toBe(false)

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
    const key = pendingBufferKey("u1", "e1")
    const draft = secretDraft()
    draft.Variants[0].Tasks[0].Check.Answer.Values = []
    draft.Variants[0].Topology.Devices[0].Bootstrap.Env.forEach((entry) => { entry.Value = "" })
    draft.Variants[0].Tasks[0].Name = "Edited in v2"
    storage.set(key, JSON.stringify({ version: 2, identity, draft, updatedAt: Date.now() }))
    const pending = readPendingChanges(key)!
    expect(pending.identity).toEqual(identity)
    expect(await openPendingSecrets(key, pending)).toEqual({ status: "none" })
    const merged = mergePendingDraft(serverDraft(), pending.draft)
    expect(merged.Variants[0].Tasks[0].Name).toBe("Edited in v2")
    expect(values(merged)).toEqual({ answers: ["ICE{server}"], env: ["", "server-mode"] })
  })
})
