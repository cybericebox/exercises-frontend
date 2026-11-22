/**
 * exercisePendingBuffer.ts — browser safety net for edits the server has not
 * acknowledged yet. One entry per user and exercise ("new" before creation).
 * Flag values and environment-variable values (device secrets included) are never
 * written in the clear: they go into `sealed`, encrypted (AES-GCM) with the session's
 * draft key (lib/draftKey), which lives in the tab's memory only. While the key cannot be
 * fetched they stay in memory and are sealed as soon as it arrives. A sealed part made
 * with another key (signed out in this browser) or one that does not decrypt is dropped;
 * the rest of the entry still restores. On restore the sealed values win over the server
 * copy; without them flags come back from the server copy and empty env values mean
 * "keep the stored value" on save. Entries older than two days are deleted.
 */
import { currentDraftKey, getDraftKey, subscribeDraftKey, type DraftKey } from "@/lib/draftKey"
import { emptyDraft, type DeviceFormValues, type DraftFormValues, type IdentityFormValues } from "@/lib/exerciseSchemas"
import { exercisePendingKey } from "@/lib/storageKeys"
import { normalizeWeight } from "@/lib/variantWeights"

/** The encrypted secret values of an entry: the id of the key, the AES-GCM nonce and the ciphertext (base64). */
export type SealedSecrets = { keyId: string; iv: string; data: string }

/**
 * The secret values of a draft. `answers`: the answer values of a task, by variant and task; `env`: the value of an
 * environment variable, by variant, device and variable name. A variant, task or device without an id yet (never
 * saved) is named by its position: the entry restores the same structure.
 */
export type PendingSecrets = { answers: Record<string, string[]>; env: Record<string, string> }

export type PendingChanges = {
  version: 2 | 3
  identity: IdentityFormValues
  draft: DraftFormValues
  updatedAt: number
  sealed?: SealedSecrets
}

export type OpenedSecrets = { status: "none" } | { status: "open"; secrets: PendingSecrets } | { status: "later" }

/** A draft nobody touched for this long is deleted (on read, and by the sweep when the editor opens). */
export const PENDING_MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000

export function pendingBufferKey(userId: string, exerciseId: string | null): string {
  return exercisePendingKey(userId, exerciseId ?? "new")
}

// ── Secret values ─────────────────────────────────────────────────────────────

const variantRef = (variant: { ID: string }, index: number) => variant.ID || `@${index}`
const answerKey = (variant: string, task: { ID: string }, index: number) => JSON.stringify([variant, task.ID || `@${index}`])
const envKey = (variant: string, device: { ID: string }, index: number, name: string) => JSON.stringify([variant, device.ID || `@${index}`, name])

/** The answer values and environment values of a draft that have something in them. */
export function collectPendingSecrets(draft: DraftFormValues): PendingSecrets {
  const secrets: PendingSecrets = { answers: {}, env: {} }
  draft.Variants.forEach((variant, vi) => {
    const ref = variantRef(variant, vi)
    variant.Tasks.forEach((task, ti) => {
      const values = task.Check?.Answer?.Values ?? []
      if (values.length > 0) secrets.answers[answerKey(ref, task, ti)] = [...values]
    })
    variant.Topology.Devices.forEach((device, di) => {
      for (const entry of device.Bootstrap.Env) if (entry.Value) secrets.env[envKey(ref, device, di, entry.Name)] = entry.Value
    })
  })
  return secrets
}

function isEmptySecrets(secrets: PendingSecrets): boolean {
  return Object.keys(secrets.answers).length === 0 && Object.keys(secrets.env).length === 0
}

/** The draft with the secret values put back where they were taken from. */
export function applyPendingSecrets(draft: DraftFormValues, secrets: PendingSecrets): DraftFormValues {
  return {
    ...draft,
    Variants: draft.Variants.map((variant, vi) => {
      const ref = variantRef(variant, vi)
      return {
        ...variant,
        Tasks: variant.Tasks.map((task, ti) => {
          const values = secrets.answers[answerKey(ref, task, ti)]
          return values ? { ...task, Check: { ...task.Check, Answer: { ...task.Check.Answer, Values: [...values] } } } : task
        }),
        Topology: {
          ...variant.Topology,
          Devices: variant.Topology.Devices.map((device, di) => ({
            ...device,
            Bootstrap: {
              ...device.Bootstrap,
              Env: device.Bootstrap.Env.map((entry) => {
                const value = secrets.env[envKey(ref, device, di, entry.Name)]
                return value !== undefined ? { ...entry, Value: value } : entry
              }),
            },
          })),
        },
      }
    }),
  }
}

/**
 * The form fields of `draft` that are empty and have a value in `secrets` (sealed values that could be opened only
 * after the form was shown): what to fill in without overwriting anything the author typed meanwhile.
 */
export function pendingSecretFills(draft: DraftFormValues, secrets: PendingSecrets): { path: string; value: string | string[] }[] {
  const fills: { path: string; value: string | string[] }[] = []
  draft.Variants.forEach((variant, vi) => {
    const ref = variantRef(variant, vi)
    variant.Tasks.forEach((task, ti) => {
      const values = secrets.answers[answerKey(ref, task, ti)]
      if (values && task.Check.Answer.Values.length === 0) fills.push({ path: `Variants.${vi}.Tasks.${ti}.Check.Answer.Values`, value: [...values] })
    })
    variant.Topology.Devices.forEach((device, di) => {
      device.Bootstrap.Env.forEach((entry, ei) => {
        const value = secrets.env[envKey(ref, device, di, entry.Name)]
        if (value !== undefined && entry.Value === "") fills.push({ path: `Variants.${vi}.Topology.Devices.${di}.Bootstrap.Env.${ei}.Value`, value })
      })
    })
  })
  return fills
}

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

// The storage key is the additional data: a sealed part cannot be moved to another user's or exercise's entry.
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

// ── Sealing in the background ─────────────────────────────────────────────────

// The last write of each entry; a sealing that finishes after a newer write (or a clear) of its entry is not stored.
const writeSeq = new Map<string, number>()
let nextSeq = 0
const sealing = new Set<Promise<void>>()
// Writes that had secret values while the key could not be fetched: written again, sealed, when it arrives.
const waiting = new Map<string, () => void>()
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

function storeSealed(storageKey: string, seq: number, sealed: SealedSecrets): void {
  if (writeSeq.get(storageKey) !== seq) return
  const entry = readStoredEntry(storageKey)
  if (!entry) return
  try { window.localStorage.setItem(storageKey, JSON.stringify({ ...entry, sealed })) } catch { /* storage unavailable */ }
}

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

function isSealed(value: unknown): value is SealedSecrets {
  return isRecord(value) && typeof value.keyId === "string" && typeof value.iv === "string" && typeof value.data === "string"
}

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
  return JSON.stringify(sanitizePendingDraft(draft), (key, value: unknown) => key === "ID" ? undefined : value)
}

const BLANK_DRAFT_SIGNATURE = contentSignature(emptyDraft())

/** True when anything beyond the untouched new-task form is entered (secret values are not content: they are only sealed). */
export function hasDraftContent(identity: IdentityFormValues, draft: DraftFormValues): boolean {
  return identity.Name.trim() !== "" || identity.Description.trim() !== "" || identity.Tags.length > 0 ||
    contentSignature(draft) !== BLANK_DRAFT_SIGNATURE
}

/**
 * Writes the entry now, without the secret values; they are sealed in the background with the session key and added
 * to the entry. Until a new sealing is stored the entry keeps its previous sealed part. Without the key the values wait
 * in memory and are written as soon as it arrives.
 */
export function writePendingChanges(key: string, identity: IdentityFormValues, draft: DraftFormValues): boolean {
  const previous = readStoredEntry(key)
  const secrets = collectPendingSecrets(draft)
  const draftKey = currentDraftKey()
  const keepSealed = isSealed(previous?.sealed) && !(draftKey && isEmptySecrets(secrets)) ? previous.sealed : undefined
  const entry: PendingChanges = {
    version: 3,
    identity: { Name: identity.Name, Description: identity.Description, Tags: [...identity.Tags] },
    draft: sanitizePendingDraft(draft),
    updatedAt: Date.now(),
    ...(keepSealed ? { sealed: keepSealed } : {}),
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(entry))
  } catch {
    return false
  }
  const seq = ++nextSeq
  writeSeq.set(key, seq)
  waiting.delete(key)
  if (isEmptySecrets(secrets)) return true
  if (!draftKey) {
    const snapshot = { identity: entry.identity, draft }
    waitForKey(key, () => { if (writeSeq.get(key) === seq && readStoredEntry(key)) writePendingChanges(key, snapshot.identity, snapshot.draft) })
    return true
  }
  track(seal(key, draftKey, secrets).then((sealed) => storeSealed(key, seq, sealed), () => undefined))
  return true
}

/**
 * The secret values of a read entry. "none": there are none, or they were sealed with another key or do not decrypt
 * (then the sealed part is removed from the entry); "later": the key cannot be fetched right now (the entry is left as is).
 */
export async function openPendingSecrets(key: string, pending: PendingChanges): Promise<OpenedSecrets> {
  if (!pending.sealed) return { status: "none" }
  const draftKey = await getDraftKey()
  if (!draftKey) return { status: "later" }
  const secrets = draftKey.id === pending.sealed.keyId ? await unseal(key, draftKey, pending.sealed) : null
  if (secrets) return { status: "open", secrets }
  const stored = readStoredEntry(key)
  if (stored && isSealed(stored.sealed) && stored.sealed.data === pending.sealed.data) {
    const { sealed, ...rest } = stored
    void sealed
    try { window.localStorage.setItem(key, JSON.stringify(rest)) } catch { /* storage unavailable */ }
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
    return { version: value.version, identity: value.identity, draft, updatedAt: value.updatedAt, ...(sealed ? { sealed } : {}) }
  } catch {
    return null
  }
}

export function clearPendingChanges(key: string): void {
  writeSeq.delete(key)
  waiting.delete(key)
  try { window.localStorage.removeItem(key) } catch { /* storage unavailable */ }
}

type ServerVariantInfo = {
  taskIds: Set<string>
  answers: Map<string, string[]>
  devicesById: Map<string, DeviceFormValues>
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
    serverInfoByVariant.set(variant.ID, { taskIds, answers, devicesById })
  }

  // Positions are those of the buffered draft (the sealed values name unsaved items by position), taken before filtering.
  const variants = pending.Variants
    .map((variant, vi) => ({ variant, ref: variantRef(variant, vi) }))
    .filter(({ variant }) => !variant.ID || serverVariantIds.has(variant.ID))
    .map(({ variant, ref }) => {
      const info = variant.ID ? serverInfoByVariant.get(variant.ID) : undefined
      return {
        ...variant,
        Tasks: variant.Tasks
          .map((task, ti) => ({ task, sealedValues: secrets?.answers[answerKey(ref, task, ti)] }))
          .filter(({ task }) => !task.ID || info?.taskIds.has(task.ID))
          // Buffers written before hints existed carry no Hints array; before
          // levels, hints carried a cost and no level.
          .map(({ task, sealedValues }) => ({ ...task, Hints: (task.Hints ?? []).map((hint) => ({ ID: hint.ID, Text: hint.Text, Level: hint.Level ?? "nudge" })), Check: { ...task.Check, Answer: { ...task.Check.Answer, Values: sealedValues ? [...sealedValues] : task.ID && info?.answers.has(task.ID) ? [...info.answers.get(task.ID)!] : [] } } })),
        Topology: {
          ...variant.Topology,
          Devices: variant.Topology.Devices.map((device, di) => {
            const serverDevice = info?.devicesById.get(device.ID)
            return {
              ...device,
              Bootstrap: {
                ...device.Bootstrap,
                Env: device.Bootstrap.Env.map((entry) => {
                  const serverEntry = serverDevice?.Bootstrap.Env.find((candidate) => candidate.Name === entry.Name)
                  const sealedValue = secrets?.env[envKey(ref, device, di, entry.Name)]
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
