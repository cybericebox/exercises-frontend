/**
 * bulk.ts — bulk actions of the catalog table.
 *
 * POST /api/exercises/bulk/archive | bulk/unarchive {IDs}, PUT /api/exercises/bulk/access {IDs, AccessLevel, EventIDs}
 * → {Changed, Skipped, Items: [{ID, Exercise (the changed card) | null, Code (why it was skipped; 0 when changed)}]}.
 * Each task is checked on the server by the rule of its single-task route. The selection goes in chunks, so the
 * button can show the progress.
 */
import { ApiError, apiPost, apiPut } from "@/api/client"
import { normalizeExercise, type AccessInput, type Exercise, type RawExercise } from "./catalog"

const BASE = "/api/exercises/bulk"

/** Tasks per request: small enough for a visible progress, far below the server cap (200). */
export const BULK_CHUNK = 10

export type BulkItem = { ID: string; Exercise: Exercise | null; Code: number }

type RawBulkResult = { Changed: number; Skipped: number; Items: { ID: string; Exercise: RawExercise | null; Code: number }[] | null }

function normalize(raw: RawBulkResult | null): BulkItem[] {
  return (raw?.Items ?? []).map((item) => ({ ID: item.ID, Exercise: item.Exercise ? normalizeExercise(item.Exercise) : null, Code: item.Code ?? 0 }))
}

export async function bulkArchive(ids: string[]): Promise<BulkItem[]> {
  return normalize(await apiPost<RawBulkResult>(`${BASE}/archive`, { IDs: ids }))
}

export async function bulkUnarchive(ids: string[]): Promise<BulkItem[]> {
  return normalize(await apiPost<RawBulkResult>(`${BASE}/unarchive`, { IDs: ids }))
}

export async function bulkSetAccess(ids: string[], input: AccessInput): Promise<BulkItem[]> {
  return normalize(await apiPut<RawBulkResult>(`${BASE}/access`, {
    IDs: ids, AccessLevel: input.AccessLevel, EventIDs: input.AccessLevel === "selected" ? input.EventIDs : [],
  }))
}

/** The code a task of a lost request is reported with: the API code, or -1 (no answer). */
function lostCode(error: unknown): number {
  return error instanceof ApiError && error.code != null ? error.code : -1
}

/**
 * Runs the selection chunk by chunk. A failed request does not stop the rest: its tasks are reported with the
 * error's code. onProgress(done, total) is called before the first chunk and after each.
 */
export async function runBulk(ids: string[], call: (chunk: string[]) => Promise<BulkItem[]>, onProgress: (done: number, total: number) => void): Promise<BulkItem[]> {
  const items: BulkItem[] = []
  onProgress(0, ids.length)
  for (let start = 0; start < ids.length; start += BULK_CHUNK) {
    const chunk = ids.slice(start, start + BULK_CHUNK)
    try {
      items.push(...await call(chunk))
    } catch (error) {
      const code = lostCode(error)
      items.push(...chunk.map((ID) => ({ ID, Exercise: null, Code: code })))
    }
    onProgress(Math.min(start + chunk.length, ids.length), ids.length)
  }
  return items
}
