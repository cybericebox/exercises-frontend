/**
 * catalog.ts — typed client for the exercises catalog.
 *
 * Routes: GET/POST /api/exercises, GET/PATCH/DELETE /api/exercises/:id.
 * JSON PascalCase; envelope {Status,Data} unwrapped by client.ts.
 * Pagination: cursor + pageSize for existing consumers, or page + pageSize
 * with total/sort/filter options for the platform admin catalog.
 */
import { apiGet, apiPost, apiPatch, apiDelete, apiKeepalive } from "@/api/client"
import type { CursorPage, OffsetPage } from "@/api/pagination"

const BASE = "/api/exercises"

export type ExerciseListItem = {
  ID: string
  Name: string
  Description: string
  Tags: string[]
  HasDraft: boolean
  HasPublished: boolean
  ArchivedAt: string | null
  CreatedAt: string
  UpdatedAt: string
}

export type Exercise = {
  ID: string
  Name: string
  Description: string
  Tags: string[]
  DraftVersionID: string | null
  PublishedVersionID: string | null
  ArchivedAt: string | null
  /** Working copy differs from the published version, or nothing is published yet. */
  HasChanges: boolean
  CreatedAt: string
  CreatedBy: string | null
  UpdatedAt: string
  UpdatedBy: string | null
}

export type ArchivedFilter = "exclude" | "only"

export type ExerciseIdentityInput = {
  Name: string
  Description: string
  Tags: string[]
}

export type ExerciseTagSuggestion = { Tag: string; Count: number }

/** Existing tags only; no separate tag registry or empty tags. */
export async function listExerciseTags(prefix: string): Promise<ExerciseTagSuggestion[]> {
  const params = new URLSearchParams({ prefix })
  return apiGet<ExerciseTagSuggestion[]>(`${BASE}/tags?${params}`)
}

export type ExercisesFilter = {
  search?: string
  tags?: string[]
  cursor?: string
  pageSize?: number
}

export type ExercisesPageFilter = {
  search?: string
  tags?: string[]
  status?: string
  archived?: ArchivedFilter
  page: number
  pageSize: number
  sortBy: string
  sortDir: "asc" | "desc"
}

type RawExerciseListItem = Omit<ExerciseListItem, "Tags" | "ArchivedAt"> & { Tags: string[] | null; ArchivedAt?: string | null }
export type RawExercise = Omit<Exercise, "Tags" | "ArchivedAt" | "HasChanges"> & {
  Tags: string[] | null
  ArchivedAt?: string | null
  HasChanges?: boolean
}

function normalizeListItem(raw: RawExerciseListItem): ExerciseListItem {
  return { ...raw, Tags: raw.Tags ?? [], ArchivedAt: raw.ArchivedAt ?? null }
}

export function normalizeExercise(raw: RawExercise): Exercise {
  return { ...raw, Tags: raw.Tags ?? [], ArchivedAt: raw.ArchivedAt ?? null, HasChanges: raw.HasChanges ?? false }
}

function buildListQuery(filter?: ExercisesFilter): string {
  const p = new URLSearchParams()
  if (filter?.search) p.set("search", filter.search)
  for (const tag of filter?.tags ?? []) p.append("tags", tag)
  if (filter?.cursor) p.set("cursor", filter.cursor)
  if (filter?.pageSize) p.set("pageSize", String(filter.pageSize))
  return p.toString()
}

/** GET /api/exercises?search=&tags=&cursor=&pageSize= */
export async function listExercises(filter?: ExercisesFilter): Promise<CursorPage<ExerciseListItem>> {
  const qs = buildListQuery(filter)
  const raw = await apiGet<CursorPage<RawExerciseListItem>>(qs ? `${BASE}?${qs}` : BASE)
  return {
    Items: (raw.Items ?? []).map(normalizeListItem),
    Total: raw.Total ?? 0,
    NextCursor: raw.NextCursor,
  }
}

/** Offset-page catalog for the platform admin; the cursor API remains available. */
export async function listExercisesPage(filter: ExercisesPageFilter): Promise<OffsetPage<ExerciseListItem>> {
  const p = new URLSearchParams()
  if (filter.search) p.set("search", filter.search)
  for (const tag of filter.tags ?? []) p.append("tags", tag)
  if (filter.status) p.set("status", filter.status)
  if (filter.archived === "only") p.set("archived", "only")
  p.set("page", String(filter.page))
  p.set("pageSize", String(filter.pageSize))
  p.set("sortBy", filter.sortBy)
  p.set("sortDir", filter.sortDir)
  const raw = await apiGet<OffsetPage<RawExerciseListItem>>(`${BASE}?${p}`)
  return { Items: (raw.Items ?? []).map(normalizeListItem), Total: raw.Total ?? 0, Page: raw.Page, PageSize: raw.PageSize }
}

/** GET /api/exercises/:id */
export async function getExercise(id: string): Promise<Exercise> {
  const raw = await apiGet<RawExercise>(`${BASE}/${id}`)
  return normalizeExercise(raw)
}

/** POST /api/exercises */
export async function createExercise(input: ExerciseIdentityInput): Promise<Exercise> {
  const raw = await apiPost<RawExercise>(BASE, input)
  return normalizeExercise(raw)
}

/** PATCH /api/exercises/:id */
export async function updateExercise(id: string, input: ExerciseIdentityInput): Promise<Exercise> {
  const raw = await apiPatch<RawExercise>(`${BASE}/${id}`, input)
  return normalizeExercise(raw)
}

/** DELETE /api/exercises/:id */
export function deleteExercise(id: string): Promise<void> {
  return apiDelete<void>(`${BASE}/${id}`)
}

/** PATCH /api/exercises/:id with keepalive — only for pagehide. */
export function updateExerciseKeepalive(id: string, input: ExerciseIdentityInput): boolean {
  return apiKeepalive("PATCH", `${BASE}/${id}`, input)
}

/** POST /api/exercises/:id/archive — idempotent. */
export async function archiveExercise(id: string): Promise<Exercise> {
  return normalizeExercise(await apiPost<RawExercise>(`${BASE}/${id}/archive`, {}))
}

/** POST /api/exercises/:id/unarchive — idempotent. */
export async function unarchiveExercise(id: string): Promise<Exercise> {
  return normalizeExercise(await apiPost<RawExercise>(`${BASE}/${id}/unarchive`, {}))
}

export type ExerciseUsageEvent = { ID: string; Name: string; Archived: boolean }
export type ExerciseUsage = { Events: ExerciseUsageEvent[] }

/** GET /api/exercises/:id/usage — distinct events where any version is attached. */
export async function getExerciseUsage(id: string): Promise<ExerciseUsage> {
  const raw = await apiGet<{ Events: ExerciseUsageEvent[] | null } | null>(`${BASE}/${id}/usage`)
  return { Events: raw?.Events ?? [] }
}
