/**
 * exercisePendingBuffer.ts — browser safety net for edits the server has not acknowledged yet. One entry per user and
 * exercise ("new" before creation).
 *
 * Flag values (Check.Answer.Values) and environment-variable values (device secrets included) are never written in the
 * clear: they go into `sealed`, encrypted (AES-GCM) with the session's draft key (lib/draftKey), which lives in the
 * tab's memory only. They are named by the client keys of their items (lib/clientKeys), never by position or by name, so
 * they follow their task, device or variable row through a reorder, a rename or a delete.
 *  - Every write stores at once the draft, the previous sealed part and `stale`: the list (keys only, no values) of the
 *    fields changed or cleared since that part was made; a restore leaves those out. So the entry is whole whenever the
 *    page goes away. When a secret changed, the full current set is then sealed and replaces the entry; without the key
 *    (or when sealing fails) the values wait in memory and are sealed as soon as it arrives.
 *  - A sealed part that this tab did not write or restore (another tab of the same exercise wrote it) is never paired
 *    with this tab's draft: every field of the draft counts as changed.
 *  - A sealed part of another key (signed out in this browser) or one that does not decrypt is dropped; the rest of the
 *    entry still restores. On restore the sealed values win over the server copy.
 *  - The entry of a new task moves to its exercise when the task is created, in one synchronous step (the "new" entry is
 *    deleted); its sealed part moves as it is, `sealedFrom` naming the entry it was made for (the entry key is the
 *    additional data), and is sealed again for the exercise entry with the key (at once, or after a reload).
 * Entries older than two days are deleted.
 */
import { set } from "react-hook-form"
import { currentDraftKey, getDraftKey, subscribeDraftKey, type DraftKey } from "@/lib/draftKey"
import { emptyDraft, type DeviceFormValues, type DraftFormValues, type IdentityFormValues } from "@/lib/exerciseSchemas"
import { exercisePendingKey } from "@/lib/storageKeys"
import { normalizeWeight } from "@/lib/variantWeights"

/** The encrypted secret values of an entry: the id of the key, the AES-GCM nonce and the ciphertext (base64). */
export type SealedSecrets = { keyId: string; iv: string; data: string }

/**
 * The secret values of a draft, by slot. `answers`: the answer values of a task (slot: variant and task client keys);
 * `env`: the value of an environment variable (slot: variant, device and row client keys). Empty values are not kept.
 */
export type PendingSecrets = { answers: Record<string, string[]>; env: Record<string, string> }

export type PendingChanges = {
  version: 2 | 3
  identity: IdentityFormValues
  draft: DraftFormValues
  updatedAt: number
  sealed?: SealedSecrets
  /** The slots changed or cleared since `sealed` was made (no values): a restore leaves them out. */
  stale?: string[]
  /** The entry key `sealed` was made for (its additional data), when it moved here with a new task and is not sealed again yet. */
  sealedFrom?: string
}

export type OpenedSecrets = { status: "none" } | { status: "open"; secrets: PendingSecrets } | { status: "later" }

/** A draft nobody touched for this long is deleted (on read, and by the sweep when the editor opens). */
export const PENDING_MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000
/** How long a restore waits for the draft key before it shows the editor (the values are filled in when the key arrives). */
export const RESTORE_KEY_TIMEOUT_MS = 5000

export function pendingBufferKey(userId: string, exerciseId: string | null): string {
  return exercisePendingKey(userId, exerciseId ?? "new")
}

// ── Slots ─────────────────────────────────────────────────────────────────────

type Keyed = { ClientKey?: string }
const answerSlot = (variant: Keyed, task: Keyed) => variant.ClientKey && task.ClientKey ? JSON.stringify(["a", variant.ClientKey, task.ClientKey]) : null
const envSlot = (variant: Keyed, device: Keyed, row: Keyed) =>
  variant.ClientKey && device.ClientKey && row.ClientKey ? JSON.stringify(["e", variant.ClientKey, device.ClientKey, row.ClientKey]) : null

type SlotVisit = { slot: string; kind: "answers"; path: string; value: string[] } | { slot: string; kind: "env"; path: string; value: string }

/** Every slot of a draft (with its form path and value), whatever its value. */
function slotsOf(draft: DraftFormValues): SlotVisit[] {
  const out: SlotVisit[] = []
  draft.Variants.forEach((variant, vi) => {
    variant.Tasks.forEach((task, ti) => {
      const slot = answerSlot(variant, task)
      if (slot) out.push({ slot, kind: "answers", path: `Variants.${vi}.Tasks.${ti}.Check.Answer.Values`, value: task.Check?.Answer?.Values ?? [] })
    })
    variant.Topology.Devices.forEach((device, di) => {
      device.Bootstrap.Env.forEach((row, ei) => {
        const slot = envSlot(variant, device, row)
        if (slot) out.push({ slot, kind: "env", path: `Variants.${vi}.Topology.Devices.${di}.Bootstrap.Env.${ei}.Value`, value: row.Value })
      })
    })
  })
  return out
}

const emptySecrets = (): PendingSecrets => ({ answers: {}, env: {} })

/** The answer values and environment values of a draft that have something in them. */
export function collectPendingSecrets(draft: DraftFormValues): PendingSecrets {
  const secrets = emptySecrets()
  for (const visit of slotsOf(draft)) {
    if (visit.kind === "answers" && visit.value.length > 0) secrets.answers[visit.slot] = [...visit.value]
    if (visit.kind === "env" && visit.value !== "") secrets.env[visit.slot] = visit.value
  }
  return secrets
}

function isEmptySecrets(secrets: PendingSecrets): boolean {
  return Object.keys(secrets.answers).length === 0 && Object.keys(secrets.env).length === 0
}

/** The value of a slot as a comparable string ("" for nothing). */
function slotValue(secrets: PendingSecrets, slot: string): string {
  const value = secrets.answers[slot] ?? secrets.env[slot]
  return value === undefined ? "" : JSON.stringify(value)
}

/** The slots whose value differs between two sets. */
function changedSlots(a: PendingSecrets, b: PendingSecrets): string[] {
  const slots = new Set([...Object.keys(a.answers), ...Object.keys(a.env), ...Object.keys(b.answers), ...Object.keys(b.env)])
  return [...slots].filter((slot) => slotValue(a, slot) !== slotValue(b, slot))
}

function withoutSlots(secrets: PendingSecrets, slots: Iterable<string>): PendingSecrets {
  const out = { answers: { ...secrets.answers }, env: { ...secrets.env } }
  for (const slot of slots) { delete out.answers[slot]; delete out.env[slot] }
  return out
}

const sealedAnswer = (secrets: PendingSecrets, variant: Keyed, task: Keyed) => { const slot = answerSlot(variant, task); return slot ? secrets.answers[slot] : undefined }
const sealedEnv = (secrets: PendingSecrets, variant: Keyed, device: Keyed, row: Keyed) => { const slot = envSlot(variant, device, row); return slot ? secrets.env[slot] : undefined }

/** The draft with the secret values put back on the items they belong to. */
export function applyPendingSecrets(draft: DraftFormValues, secrets: PendingSecrets): DraftFormValues {
  const out = structuredClone(draft)
  for (const visit of slotsOf(out)) {
    const value = visit.kind === "answers" ? secrets.answers[visit.slot] : secrets.env[visit.slot]
    if (value !== undefined) set(out, visit.path, Array.isArray(value) ? [...value] : value)
  }
  return out
}

// ── Baselines ─────────────────────────────────────────────────────────────────
// What the secret fields of an entry held when its sealed part was made (or, after a restore, what the restore showed):
// a field that differs from it was changed by the author since.
const baselines = new Map<string, PendingSecrets>()

/**
 * The restore of an entry has shown these values: changes from here on are the author's (they win over the sealed part).
 * The sealed part stored now is the one this tab knows.
 */
export function markPendingBaseline(key: string, draft: DraftFormValues): void {
  baselines.set(key, collectPendingSecrets(draft))
  const stored = readStoredEntry(key)
  if (isSealed(stored?.sealed)) knownSealed.set(key, stored.sealed.data)
}

/**
 * The fields to fill with sealed values that could be opened only after the form was shown: the buffered value wins over
 * the shown one, unless the author changed that field since the restore. Matched by client key only.
 */
export function pendingSecretFills(key: string, draft: DraftFormValues, secrets: PendingSecrets): { path: string; value: string | string[] }[] {
  const baseline = baselines.get(key) ?? emptySecrets()
  const current = collectPendingSecrets(draft)
  const fills: { path: string; value: string | string[] }[] = []
  for (const visit of slotsOf(draft)) {
    const value = visit.kind === "answers" ? secrets.answers[visit.slot] : secrets.env[visit.slot]
    if (value === undefined) continue
    if (slotValue(current, visit.slot) !== slotValue(baseline, visit.slot)) continue
    if (slotValue(current, visit.slot) === JSON.stringify(value)) continue
    fills.push({ path: visit.path, value: Array.isArray(value) ? [...value] : value })
  }
  return fills
}

// ── Encryption ────────────────────────────────────────────────────────────────

function toBase64(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// The entry key is the additional data: a sealed part cannot be moved to another user's or exercise's entry.
const additionalData = (storageKey: string) => new TextEncoder().encode(storageKey)

async function seal(storageKey: string, key: DraftKey, secrets: PendingSecrets): Promise<SealedSecrets> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plain = new TextEncoder().encode(JSON.stringify(secrets))
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: additionalData(storageKey) }, key.key, plain)
  return { keyId: key.id, iv: toBase64(iv), data: toBase64(new Uint8Array(data)) }
}

function isSecrets(value: unknown): value is PendingSecrets {
  if (!isRecord(value) || !isRecord(value.answers) || !isRecord(value.env)) return false
  return Object.values(value.answers).every((values) => Array.isArray(values) && values.every((item) => typeof item === "string")) &&
    Object.values(value.env).every((item) => typeof item === "string")
}

async function unseal(storageKey: string, key: DraftKey, sealed: SealedSecrets): Promise<PendingSecrets | null> {
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(sealed.iv), additionalData: additionalData(storageKey) }, key.key, fromBase64(sealed.data))
    const value: unknown = JSON.parse(new TextDecoder().decode(plain))
    return isSecrets(value) ? value : null
  } catch {
    return null
  }
}

// ── Storage ───────────────────────────────────────────────────────────────────

function readStoredEntry(storageKey: string): Record<string, unknown> | null {
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    return isRecord(value) ? value : null
  } catch {
    return null
  }
}

function store(storageKey: string, entry: object): boolean {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(entry))
    return true
  } catch {
    return false
  }
}

function removeStored(storageKey: string): void {
  try { window.localStorage.removeItem(storageKey) } catch { /* storage unavailable */ }
}

function isSealed(value: unknown): value is SealedSecrets {
  return isRecord(value) && typeof value.keyId === "string" && typeof value.iv === "string" && typeof value.data === "string"
}

/**
 * The `sealedFrom` of an entry: undefined when it has none, the key when it is the new-task entry of the same user as the
 * entry (the only place a sealed part moves from), null for anything else (copied from another exercise or user).
 */
const PENDING_PREFIX = exercisePendingKey("", "").slice(0, -1)

function sealedFromOf(entryKey: string, entry: Record<string, unknown> | null): string | undefined | null {
  const from = entry?.sealedFrom
  if (from === undefined) return undefined
  if (typeof from !== "string" || !from.endsWith("_new")) return null
  // Keys are cib_exercise_pending_<user>_<exercise>: the same user, and one more part (an exercise id) after it.
  const userPrefix = from.slice(0, -"new".length)
  const rest = entryKey.startsWith(userPrefix) ? entryKey.slice(userPrefix.length) : ""
  const user = from.slice(PENDING_PREFIX.length, -"_new".length)
  return from.startsWith(PENDING_PREFIX) && user !== "" && from === exercisePendingKey(user, "new") && rest !== "" && !rest.includes("_") ? from : null
}

function staleOf(entry: Record<string, unknown> | null): string[] {
  return Array.isArray(entry?.stale) ? entry.stale.filter((slot): slot is string => typeof slot === "string") : []
}

// ── Writing ───────────────────────────────────────────────────────────────────

// The last write of each entry; a sealing that finishes after a newer write (or a clear) of its entry is not stored.
const writeSeq = new Map<string, number>()
let nextSeq = 0
const sealing = new Set<Promise<void>>()
// Writes that had secret values (or a sealed part to seal again) while the key could not be had: written again when it arrives.
const waiting = new Map<string, () => void>()
// The sealed part (its ciphertext) this tab last wrote, restored or carried for each entry. Another one in the storage is
// another tab's: none of its values is paired with this tab's draft.
const knownSealed = new Map<string, string>()
let unsubscribeKey: (() => void) | null = null

function track(work: Promise<void>): void {
  sealing.add(work)
  void work.finally(() => sealing.delete(work))
}

/** Resolves when every sealing under way has been stored (tests, and before a check of the storage). */
export async function flushPendingSealing(): Promise<void> {
  while (sealing.size > 0) await Promise.all([...sealing])
}

function waitForKey(storageKey: string, rewrite: () => void): void {
  waiting.set(storageKey, rewrite)
  if (unsubscribeKey) return
  unsubscribeKey = subscribeDraftKey(() => {
    if (!currentDraftKey()) return
    unsubscribeKey?.()
    unsubscribeKey = null
    const rewrites = [...waiting.values()]
    waiting.clear()
    for (const run of rewrites) run()
  })
}

/**
 * Writes the entry of a draft, at once: the draft, the previous sealed part and the fields changed since it was made
 * (`stale`), so the entry is whole whenever the page goes away. When a secret value changed (or the sealed part was made
 * for another entry, or with another key) the full current set is then sealed and replaces the entry; without the key,
 * that happens as soon as it arrives. `from`: the entry this one takes over (a new task just created): it is deleted in
 * the same step and its sealed part moves as it is (`sealedFrom` names its additional data) until it is sealed again.
 */
export function writePendingChanges(key: string, identity: IdentityFormValues, draft: DraftFormValues, options: { from?: string } = {}): boolean {
  const source = options.from ?? key
  const seq = ++nextSeq
  writeSeq.set(key, seq)
  waiting.delete(key)

  const previous = readStoredEntry(source)
  // The additional data the previous sealed part was made with: its own entry's key, or this user's new-task entry it moved
  // from. Any other `sealedFrom` (a part copied from another exercise or user) drops the sealed part.
  const from = sealedFromOf(source, previous)
  const previousSealed = from !== null && isSealed(previous?.sealed) ? previous.sealed : undefined
  const sealedAad = from ?? source
  const current = collectPendingSecrets(draft)
  const known = previousSealed !== undefined && knownSealed.get(source) === previousSealed.data
  const edited = new Set(staleOf(previous))
  if (previousSealed) {
    if (known) for (const slot of changedSlots(current, baselines.get(source) ?? emptySecrets())) edited.add(slot)
    // Another tab's sealed part: every field of this draft is this tab's, none of those values may be restored.
    else for (const visit of slotsOf(draft)) edited.add(visit.slot)
  }
  if (source !== key) {
    const baseline = baselines.get(source)
    if (baseline) baselines.set(key, baseline)
    baselines.delete(source)
    knownSealed.delete(source)
    writeSeq.delete(source)
    waiting.delete(source)
  }

  const entry: PendingChanges = {
    version: 3,
    identity: { Name: identity.Name, Description: identity.Description, Tags: [...identity.Tags] },
    draft: sanitizePendingDraft(draft),
    updatedAt: Date.now(),
  }
  const kept = previousSealed
    ? { ...entry, sealed: previousSealed, ...(sealedAad !== key ? { sealedFrom: sealedAad } : {}), ...(edited.size ? { stale: [...edited] } : {}) }
    : entry
  if (!store(key, kept)) return false
  if (source !== key) removeStored(source)
  if (previousSealed) knownSealed.set(key, previousSealed.data)
  else knownSealed.delete(key)

  const draftKey = currentDraftKey()
  const needsSeal = previousSealed ? edited.size > 0 || sealedAad !== key || previousSealed.keyId !== draftKey?.id : !isEmptySecrets(current)
  if (!needsSeal) {
    if (!previousSealed) baselines.set(key, current)
    return true
  }
  if (!draftKey) {
    waitForKey(key, () => { if (writeSeq.get(key) === seq && readStoredEntry(key)) writePendingChanges(key, identity, draft) })
    return true
  }

  track((async () => {
    const final = { answers: { ...current.answers }, env: { ...current.env } }
    if (previousSealed && previousSealed.keyId === draftKey.id) {
      const old = await unseal(sealedAad, draftKey, previousSealed)
      if (old) {
        // Sealed values of fields the author did not touch since stay (they may not be in the form yet: a restore without the key).
        const present = new Set(slotsOf(draft).map((visit) => visit.slot))
        for (const [slot, value] of Object.entries(old.answers)) if (present.has(slot) && !edited.has(slot)) final.answers[slot] = value
        for (const [slot, value] of Object.entries(old.env)) if (present.has(slot) && !edited.has(slot)) final.env[slot] = value
      }
    }
    let sealed: SealedSecrets | undefined
    if (!isEmptySecrets(final)) {
      // A failed encryption leaves the entry written above: the previous sealed part with the changed fields marked stale.
      try { sealed = await seal(key, draftKey, final) } catch { return }
    }
    if (writeSeq.get(key) !== seq) return
    if (!store(key, sealed ? { ...entry, sealed } : entry)) return
    if (sealed) knownSealed.set(key, sealed.data)
    else knownSealed.delete(key)
    baselines.set(key, final)
  })())
  return true
}

/** The entry of a new task becomes the entry of the exercise it was created as, in one step; its sealed part goes with it. */
export function movePendingChanges(from: string, to: string, identity: IdentityFormValues, draft: DraftFormValues): boolean {
  return writePendingChanges(to, identity, draft, { from })
}

/**
 * The secret values of a read entry, without the stale ones. "none": there are none, or they were sealed with another key
 * or do not decrypt (then the sealed part is removed from the entry); "later": the key cannot be had now (it is waited
 * for about five seconds; the entry is left as is).
 */
export async function openPendingSecrets(key: string, pending: PendingChanges, timeoutMs = RESTORE_KEY_TIMEOUT_MS): Promise<OpenedSecrets> {
  if (!pending.sealed) return { status: "none" }
  let timer: ReturnType<typeof setTimeout> | undefined
  const draftKey = await Promise.race([
    getDraftKey(),
    new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs) }),
  ]).finally(() => clearTimeout(timer))
  if (!draftKey) return { status: "later" }
  const secrets = draftKey.id === pending.sealed.keyId ? await unseal(pending.sealedFrom ?? key, draftKey, pending.sealed) : null
  if (secrets) return { status: "open", secrets: withoutSlots(secrets, pending.stale ?? []) }
  const stored = readStoredEntry(key)
  if (stored && isSealed(stored.sealed) && stored.sealed.data === pending.sealed.data) {
    const { sealed, stale, sealedFrom, ...rest } = stored
    void sealed
    void stale
    void sealedFrom
    store(key, rest)
  }
  return { status: "none" }
}

/** Deletes the expired entries of a user (the editor opened). */
export function sweepPendingChanges(userId: string): void {
  const prefix = exercisePendingKey(userId, "")
  const keys: string[] = []
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (key?.startsWith(prefix)) keys.push(key)
    }
  } catch {
    return
  }
  for (const key of keys) readPendingChanges(key)
}

/** Tests only: forgets what this tab keeps in memory (a new page load). */
export function resetPendingBufferForTests(): void {
  writeSeq.clear()
  waiting.clear()
  knownSealed.clear()
  baselines.clear()
  sealing.clear()
  unsubscribeKey?.()
  unsubscribeKey = null
}

// ── Draft ─────────────────────────────────────────────────────────────────────

export function sanitizePendingDraft(draft: DraftFormValues): DraftFormValues {
  return {
    ...draft,
    Variants: draft.Variants.map((variant) => ({
      ...variant,
      // The expected answers are never buffered in the browser.
      Tasks: variant.Tasks.map((task) => ({ ...task, Check: { ...task.Check, Answer: { ...task.Check.Answer, Values: [] } } })),
      Topology: {
        ...variant.Topology,
        Devices: variant.Topology.Devices.map((device) => ({
          ...device,
          // A ValueGroup is meaningful only within the server answer it came from: never persisted.
          Bootstrap: {
            ...device.Bootstrap,
            Env: device.Bootstrap.Env.map((entry) => {
              const { ValueGroup, ...rest } = entry
              void ValueGroup
              return { ...rest, Value: "" }
            }),
          },
        })),
      },
    })),
  }
}

// Client-generated ids differ between two empty drafts; everything else is the content.
function contentSignature(draft: DraftFormValues): string {
  return JSON.stringify(sanitizePendingDraft(draft), (key, value: unknown) => key === "ID" || key === "ClientKey" ? undefined : value)
}

const BLANK_DRAFT_SIGNATURE = contentSignature(emptyDraft())

/** True when anything beyond the untouched new-task form is entered (secret values are not content: they are only sealed). */
export function hasDraftContent(identity: IdentityFormValues, draft: DraftFormValues): boolean {
  return identity.Name.trim() !== "" || identity.Description.trim() !== "" || identity.Tags.length > 0 ||
    contentSignature(draft) !== BLANK_DRAFT_SIGNATURE
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isIdentity(value: unknown): value is IdentityFormValues {
  return isRecord(value) && typeof value.Name === "string" && typeof value.Description === "string" &&
    Array.isArray(value.Tags) && value.Tags.every((tag: unknown) => typeof tag === "string")
}

function isDraft(value: unknown): value is DraftFormValues {
  if (!isRecord(value) || typeof value.AdminNote !== "string" || !Array.isArray(value.Variants) || value.Variants.length === 0) return false
  return value.Variants.every((variant: unknown) =>
    isRecord(variant) && typeof variant.ID === "string" && Array.isArray(variant.Tasks) &&
    variant.Tasks.every((task: unknown) => isRecord(task) && typeof task.ID === "string" && isRecord(task.Check)) &&
    isRecord(variant.Topology) && Array.isArray(variant.Topology.Devices) && Array.isArray(variant.Topology.Connections) &&
    variant.Topology.Devices.every((device: unknown) => isRecord(device) && Array.isArray(device.Interfaces) && isRecord(device.Bootstrap)))
}

export function readPendingChanges(key: string): PendingChanges | null {
  let raw: string | null
  try { raw = window.localStorage.getItem(key) } catch { return null }
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!isRecord(value) || (value.version !== 2 && value.version !== 3) || !isIdentity(value.identity) || !isDraft(value.draft) ||
      typeof value.updatedAt !== "number") return null
    if (Date.now() - value.updatedAt > PENDING_MAX_AGE_MS) {
      clearPendingChanges(key)
      return null
    }
    // Buffers written before linked variants carry no LinkedTo, before weights no Weight.
    const draft: DraftFormValues = {
      ...value.draft,
      Variants: value.draft.Variants.map((variant) => ({ ...variant, LinkedTo: variant.LinkedTo ?? "", Weight: normalizeWeight(variant.Weight) })),
    }
    const sealed = value.version === 3 && isSealed(value.sealed) ? value.sealed : undefined
    const stale = sealed ? staleOf(value) : []
    const from = sealedFromOf(key, value)
    // A sealed part that claims to come from anywhere but this user's new-task entry is not read at all.
    if (from === null) return { version: value.version, identity: value.identity, draft, updatedAt: value.updatedAt }
    const sealedFrom = sealed && from ? from : undefined
    return { version: value.version, identity: value.identity, draft, updatedAt: value.updatedAt, ...(sealed ? { sealed } : {}), ...(stale.length ? { stale } : {}), ...(sealedFrom ? { sealedFrom } : {}) }
  } catch {
    return null
  }
}

export function clearPendingChanges(key: string): void {
  writeSeq.delete(key)
  waiting.delete(key)
  baselines.delete(key)
  knownSealed.delete(key)
  removeStored(key)
}

type ServerVariantInfo = {
  taskIds: Set<string>
  answers: Map<string, string[]>
  devicesById: Map<string, DeviceFormValues>
  variant: DraftFormValues["Variants"][number]
}

type Connection = DraftFormValues["Variants"][number]["Topology"]["Connections"][number]

/** The two ends of a connection, in either order: what identifies it (connections have no ID). */
function connectionKey(connection: Connection): string {
  return connection.Endpoints.map((endpoint) => `${endpoint.DeviceID}\0${endpoint.Interface}`).sort().join("\0\0")
}

/**
 * The console model and the opponents are not edited in the editor: they always come from the server's copy, never from a
 * buffer (an old one has none of them, a newer one may hold stale values). Devices match by ID, connections by their two ends;
 * a console cable of the server that the buffer lacks comes back while both its devices are still there, and one the server no
 * longer has is dropped.
 */
function withServerConsoleModel(variant: DraftFormValues["Variants"][number], server: DraftFormValues["Variants"][number] | undefined): DraftFormValues["Variants"][number] {
  // A variant, device or connection the server does not have (new in this browser) keeps what the buffer holds.
  if (!server) return variant
  const serverDevices = new Map(server.Topology.Devices.map((device) => [device.ID, device] as const))
  const serverConnections = new Map(server.Topology.Connections.map((connection) => [connectionKey(connection), connection] as const))
  const devices = variant.Topology.Devices.map((device) => {
    const { ConsolePorts, SerialPorts, ...rest } = device
    void ConsolePorts
    void SerialPorts
    const own = serverDevices.get(device.ID)
    if (!own) return device
    return { ...rest, ...(own.ConsolePorts ? { ConsolePorts: own.ConsolePorts } : {}), ...(own.SerialPorts ? { SerialPorts: own.SerialPorts } : {}) }
  })
  const present = new Set(variant.Topology.Connections.map(connectionKey))
  const deviceIds = new Set(devices.map((device) => device.ID))
  const connections = [
    ...variant.Topology.Connections.map((connection) => {
      const own = serverConnections.get(connectionKey(connection))
      // A cable the server does not have is stale: the editor cannot make one. A new network link stays as typed.
      if (!own) return connection.Kind ? [] : [connection]
      const { Kind, ...rest } = connection
      void Kind
      return [own.Kind ? { Kind: own.Kind, ...rest } : rest]
    }).flat(),
    ...server.Topology.Connections.filter((connection) => connection.Kind && !present.has(connectionKey(connection)) &&
      connection.Endpoints.every((endpoint) => deviceIds.has(endpoint.DeviceID))),
  ]
  const { Opponents, ...rest } = variant
  void Opponents
  return { ...rest, ...(server.Opponents ? { Opponents: server.Opponents } : {}), Topology: { ...variant.Topology, Devices: devices, Connections: connections } }
}

/**
 * Buffered edits on top of the server copy.
 *  - Answer values of known tasks come from the server (the buffer never stores them).
 *  - A pending variant/task with a non-empty ID that no longer exists on the server was
 *    deleted there while the buffer was stale — it is dropped, not resurrected. ID-less
 *    (brand new, never saved) variants/tasks are always kept.
 *  - Env-var HasValue is refreshed from the server's matching device (by device ID) so a
 *    secret set/rotated after the buffer was written still round-trips as "has a value"
 *    instead of failing "secret requires a value" validation on a blank buffered Value.
 *  - The opened sealed values (`secrets`) win over the server copy for the answers and env values they hold.
 *  - Opponents, console and serial ports and the kind of each connection are the server's (withServerConsoleModel).
 */
export function mergePendingDraft(server: DraftFormValues, pending: DraftFormValues, secrets?: PendingSecrets): DraftFormValues {
  const serverVariantIds = new Set(server.Variants.filter((variant) => variant.ID).map((variant) => variant.ID))
  const serverInfoByVariant = new Map<string, ServerVariantInfo>()
  for (const variant of server.Variants) {
    if (!variant.ID) continue
    const taskIds = new Set<string>()
    const answers = new Map<string, string[]>()
    for (const task of variant.Tasks) {
      if (task.ID) { taskIds.add(task.ID); answers.set(task.ID, task.Check.Answer.Values) }
    }
    const devicesById = new Map(variant.Topology.Devices.map((device) => [device.ID, device] as const))
    serverInfoByVariant.set(variant.ID, { taskIds, answers, devicesById, variant })
  }

  // The sealed values name the buffered items by their client keys: an item that is no longer there gets nothing.
  const variants = pending.Variants
    .filter((variant) => !variant.ID || serverVariantIds.has(variant.ID))
    .map((buffered) => {
      const info = buffered.ID ? serverInfoByVariant.get(buffered.ID) : undefined
      const variant = withServerConsoleModel(buffered, info?.variant)
      return {
        ...variant,
        Tasks: variant.Tasks
          .map((task) => ({ task, sealedValues: secrets ? sealedAnswer(secrets, variant, task) : undefined }))
          .filter(({ task }) => !task.ID || info?.taskIds.has(task.ID))
          // Buffers written before hints existed carry no Hints array; before
          // levels, hints carried a cost and no level.
          .map(({ task, sealedValues }) => ({ ...task, Hints: (task.Hints ?? []).map((hint) => ({ ID: hint.ID, Text: hint.Text, Level: hint.Level ?? "nudge" })), Check: { ...task.Check, Answer: { ...task.Check.Answer, Values: sealedValues ? [...sealedValues] : task.ID && info?.answers.has(task.ID) ? [...info.answers.get(task.ID)!] : [] } } })),
        Topology: {
          ...variant.Topology,
          Devices: variant.Topology.Devices.map((device) => {
            const serverDevice = info?.devicesById.get(device.ID)
            return {
              ...device,
              Bootstrap: {
                ...device.Bootstrap,
                Env: device.Bootstrap.Env.map((entry) => {
                  const serverEntry = serverDevice?.Bootstrap.Env.find((candidate) => candidate.Name === entry.Name)
                  const sealedValue = secrets ? sealedEnv(secrets, variant, device, entry) : undefined
                  if (sealedValue !== undefined) return { ...entry, Value: sealedValue, HasValue: serverEntry?.HasValue ?? false }
                  return {
                    ...entry,
                    // The buffer never holds a value (sanitizePendingDraft), so a plain variable that exists on the server takes its
                    // stored value back; a blank one would be sent with the next save and erase it. A secret stays blank = keep.
                    Value: serverEntry && !entry.Secret && !serverEntry.Secret ? serverEntry.Value : entry.Value,
                    HasValue: serverEntry?.HasValue ?? false,
                  }
                }),
              },
            }
          }),
        },
      }
    })

  return { ...pending, Variants: variants }
}
