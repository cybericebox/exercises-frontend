/**
 * catalog.ts — typed client for the exercises catalog.
 *
 * Routes: GET/POST /api/exercises, GET/PATCH/DELETE /api/exercises/:id.
 * JSON PascalCase; envelope {Status,Data} unwrapped by client.ts.
 * Pagination: cursor + pageSize for existing consumers, or page + pageSize
 * with total/sort/filter options for the platform admin catalog.
 */
import { apiGet, apiPost, apiPatch, apiPut, apiDelete, apiKeepalive } from "@/api/client"
import type { CursorPage, OffsetPage } from "@/api/pagination"

const BASE = "/api/exercises"

export type ExerciseScope = "catalog" | "event"
/** Catalog access level; "" for event-scoped exercises. */
export type AccessLevel = "all" | "selected" | "own" | ""
export type ForkedFrom = { ExerciseID: string; ExerciseName: string; VersionID: string }

/** Per-exercise rights computed by the server for the caller. */
export type ExercisePermissions = {
  CanRead: boolean
  CanEdit: boolean
  CanPublish: boolean
  CanDelete: boolean
  CanManageAccess: boolean
  CanPropose: boolean
  CanExport: boolean
}

/** Ownership / scope fields shared by the list item and the card. */
export type ExerciseOwnership = {
  Scope: ExerciseScope
  OwnerEventID: string | null
  OwnerEventName: string
  AccessLevel: AccessLevel
  AccessEventIDs: string[]
  OriginEventID: string | null
  ForkedFrom: ForkedFrom | null
  Infrastructure: boolean
  PendingProposalID: string | null
  /** null when the server sent none (older API) — callers fall back to RBAC. */
  Permissions: ExercisePermissions | null
}

export type ExerciseListItem = ExerciseOwnership & {
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

export type Exercise = ExerciseOwnership & {
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

/** Create body: OwnerEventID null → catalog (admins), else the owner event. */
export type ExerciseCreateInput = ExerciseIdentityInput & { OwnerEventID?: string | null }

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

export type ScopeFilter = "catalog" | "event" | ""
export type InfrastructureFilter = "yes" | "no" | ""

export type ExercisesPageFilter = {
  search?: string
  tags?: string[]
  status?: string
  archived?: ArchivedFilter
  scope?: ScopeFilter
  event?: string
  infrastructure?: InfrastructureFilter
  page: number
  pageSize: number
  sortBy: string
  sortDir: "asc" | "desc"
}

type RawOwnership = Partial<Omit<ExerciseOwnership, "AccessEventIDs">> & { AccessEventIDs?: string[] | null }
type RawExerciseListItem = Omit<ExerciseListItem, "Tags" | "ArchivedAt" | keyof ExerciseOwnership> & RawOwnership & {
  Tags: string[] | null
  ArchivedAt?: string | null
}
export type RawExercise = Omit<Exercise, "Tags" | "ArchivedAt" | "HasChanges" | keyof ExerciseOwnership> & RawOwnership & {
  Tags: string[] | null
  ArchivedAt?: string | null
  HasChanges?: boolean
}

/** Fills the W4 ownership fields with defaults (older payloads omit them). */
export function normalizeOwnership(raw: RawOwnership): ExerciseOwnership {
  const scope: ExerciseScope = raw.Scope === "event" ? "event" : "catalog"
  return {
    Scope: scope,
    OwnerEventID: raw.OwnerEventID ?? null,
    OwnerEventName: raw.OwnerEventName ?? "",
    AccessLevel: scope === "event" ? "" : raw.AccessLevel ?? "",
    AccessEventIDs: raw.AccessEventIDs ?? [],
    OriginEventID: raw.OriginEventID ?? null,
    ForkedFrom: raw.ForkedFrom ?? null,
    Infrastructure: raw.Infrastructure ?? false,
    PendingProposalID: raw.PendingProposalID ?? null,
    Permissions: raw.Permissions ?? null,
  }
}

function normalizeListItem(raw: RawExerciseListItem): ExerciseListItem {
  return { ...raw, ...normalizeOwnership(raw), Tags: raw.Tags ?? [], ArchivedAt: raw.ArchivedAt ?? null }
}

export function normalizeExercise(raw: RawExercise): Exercise {
  return { ...raw, ...normalizeOwnership(raw), Tags: raw.Tags ?? [], ArchivedAt: raw.ArchivedAt ?? null, HasChanges: raw.HasChanges ?? false }
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
  if (filter.scope) p.set("scope", filter.scope)
  if (filter.event) p.set("event", filter.event)
  if (filter.infrastructure) p.set("infrastructure", filter.infrastructure)
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

/** POST /api/exercises — OwnerEventID omitted/null creates a catalog exercise. */
export async function createExercise(input: ExerciseCreateInput): Promise<Exercise> {
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

export type AccessInput = { AccessLevel: Exclude<AccessLevel, "">; EventIDs: string[] }

/** PUT /api/exercises/:id/access — admins, catalog exercises only. */
export async function setExerciseAccess(id: string, input: AccessInput): Promise<Exercise> {
  const body: AccessInput = { AccessLevel: input.AccessLevel, EventIDs: input.AccessLevel === "selected" ? input.EventIDs : [] }
  return normalizeExercise(await apiPut<RawExercise>(`${BASE}/${id}/access`, body))
}

/** Defaults for an exercise without W4 ownership data (a plain catalog exercise). */
export const DEFAULT_OWNERSHIP: ExerciseOwnership = normalizeOwnership({})
