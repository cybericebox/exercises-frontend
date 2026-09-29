/**
 * exercisePendingBuffer.ts — browser safety net for edits the server has not
 * acknowledged yet. One entry per user and exercise ("new" before creation).
 * Flag values and environment-variable values (device secrets included) are
 * never written; on restore flags come back from the server copy and empty
 * env values mean "keep the stored value" on save.
 */
import type { DeviceFormValues, DraftFormValues, IdentityFormValues } from "@/lib/exerciseSchemas"

const PREFIX = "cybericebox.admin.exercise-pending.v1:"

export type PendingChanges = {
  version: 1
  identity: IdentityFormValues
  draft: DraftFormValues
  updatedAt: number
}

export function pendingBufferKey(userId: string, exerciseId: string | null): string {
  return `${PREFIX}${userId}:${exerciseId ?? "new"}`
}

export function sanitizePendingDraft(draft: DraftFormValues): DraftFormValues {
  return {
    ...draft,
    Variants: draft.Variants.map((variant) => ({
      ...variant,
      Tasks: variant.Tasks.map((task) => ({ ...task, Flag: [] })),
      Topology: {
        ...variant.Topology,
        Devices: variant.Topology.Devices.map((device) => ({
          ...device,
          EnvVars: device.EnvVars.map((env) => ({ ...env, Value: "" })),
        })),
      },
    })),
  }
}

export function writePendingChanges(key: string, identity: IdentityFormValues, draft: DraftFormValues): boolean {
  const entry: PendingChanges = {
    version: 1,
    identity: { Name: identity.Name, Description: identity.Description, Tags: [...identity.Tags] },
    draft: sanitizePendingDraft(draft),
    updatedAt: Date.now(),
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(entry))
    return true
  } catch {
    return false
  }
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
    variant.Tasks.every((task: unknown) => isRecord(task) && typeof task.ID === "string" && Array.isArray(task.Flag)) &&
    isRecord(variant.Topology) && Array.isArray(variant.Topology.Devices) && Array.isArray(variant.Topology.Connections) &&
    variant.Topology.Devices.every((device: unknown) => isRecord(device) && Array.isArray(device.Interfaces) && Array.isArray(device.EnvVars)))
}

export function readPendingChanges(key: string): PendingChanges | null {
  let raw: string | null
  try { raw = window.localStorage.getItem(key) } catch { return null }
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!isRecord(value) || value.version !== 1 || !isIdentity(value.identity) || !isDraft(value.draft) ||
      typeof value.updatedAt !== "number") return null
    return { version: 1, identity: value.identity, draft: value.draft, updatedAt: value.updatedAt }
  } catch {
    return null
  }
}

export function clearPendingChanges(key: string): void {
  try { window.localStorage.removeItem(key) } catch { /* storage unavailable */ }
}

type ServerVariantInfo = {
  taskIds: Set<string>
  flags: Map<string, string[]>
  devicesById: Map<string, DeviceFormValues>
}

/**
 * Buffered edits on top of the server copy.
 *  - Flag values of known tasks come from the server (the buffer never stores flags).
 *  - A pending variant/task with a non-empty ID that no longer exists on the server was
 *    deleted there while the buffer was stale — it is dropped, not resurrected. ID-less
 *    (brand new, never saved) variants/tasks are always kept.
 *  - Env-var HasValue is refreshed from the server's matching device (by device ID) so a
 *    secret set/rotated after the buffer was written still round-trips as "has a value"
 *    instead of failing "secret requires a value" validation on a blank buffered Value.
 */
export function mergePendingDraft(server: DraftFormValues, pending: DraftFormValues): DraftFormValues {
  const serverVariantIds = new Set(server.Variants.filter((variant) => variant.ID).map((variant) => variant.ID))
  const serverInfoByVariant = new Map<string, ServerVariantInfo>()
  for (const variant of server.Variants) {
    if (!variant.ID) continue
    const taskIds = new Set<string>()
    const flags = new Map<string, string[]>()
    for (const task of variant.Tasks) {
      if (task.ID) { taskIds.add(task.ID); flags.set(task.ID, task.Flag) }
    }
    const devicesById = new Map(variant.Topology.Devices.map((device) => [device.ID, device] as const))
    serverInfoByVariant.set(variant.ID, { taskIds, flags, devicesById })
  }

  const variants = pending.Variants
    .filter((variant) => !variant.ID || serverVariantIds.has(variant.ID))
    .map((variant) => {
      const info = variant.ID ? serverInfoByVariant.get(variant.ID) : undefined
      return {
        ...variant,
        Tasks: variant.Tasks
          .filter((task) => !task.ID || info?.taskIds.has(task.ID))
          // Buffers written before hints existed carry no Hints array; before
          // levels, hints carried a cost and no level.
          .map((task) => ({ ...task, Hints: (task.Hints ?? []).map((hint) => ({ ID: hint.ID, Text: hint.Text, Level: hint.Level ?? "nudge" })), Flag: task.ID && info?.flags.has(task.ID) ? [...info.flags.get(task.ID)!] : [] })),
        Topology: {
          ...variant.Topology,
          Devices: variant.Topology.Devices.map((device) => {
            const serverDevice = info?.devicesById.get(device.ID)
            return {
              ...device,
              EnvVars: device.EnvVars.map((env) => ({
                ...env,
                HasValue: serverDevice?.EnvVars.find((serverEnv) => serverEnv.Name === env.Name)?.HasValue ?? false,
              })),
            }
          }),
        },
      }
    })

  return { ...pending, Variants: variants }
}
