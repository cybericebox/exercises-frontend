/**
 * catalogList.ts — catalog table rules: one status per row, the access label,
 * the filters ↔ URL mapping and the list query. Filtering, paging and sorting
 * (several events, every status) happen on the server.
 */
import type { ExerciseListItem, ExerciseStatus, InfrastructureFilter, ScopeFilter, ExercisesPageFilter } from "@/api/exercises/catalog"
import type { OffsetPage } from "@/api/pagination"

/** The single status shown in the table. */
export type CatalogStatus = "published" | "changed" | "draft" | "archived" | "none"

const FROM_SERVER: Record<ExerciseStatus, CatalogStatus> = {
  none: "none", draft_only: "draft", changed: "changed", published: "published", archived: "archived",
}

/** The server's Status; derived from the version flags for an older API. */
export function catalogStatus(item: Pick<ExerciseListItem, "ArchivedAt" | "HasDraft" | "HasPublished"> & { Status?: ExerciseStatus | null }): CatalogStatus {
  if (item.Status && item.Status in FROM_SERVER) return FROM_SERVER[item.Status]
  if (item.ArchivedAt) return "archived"
  if (item.HasPublished) return item.HasDraft ? "changed" : "published"
  return item.HasDraft ? "draft" : "none"
}

/** The same status for the exercise card, which knows whether the draft really differs. */
export function headerStatus(exercise: { ArchivedAt: string | null; PublishedVersionID: string | null; DraftVersionID: string | null; HasChanges: boolean }): CatalogStatus {
  if (exercise.ArchivedAt) return "archived"
  if (exercise.PublishedVersionID) return exercise.HasChanges ? "changed" : "published"
  return exercise.DraftVersionID ? "draft" : "none"
}

export type AccessKind = "event" | "all" | "selected" | "own" | "none" | "unknown"
export type AccessInfo = { kind: AccessKind; eventName: string; eventIds: string[] }

/** Who can use the exercise: its owner event, or the catalog access level. */
export function accessInfo(item: Pick<ExerciseListItem, "Scope" | "OwnerEventName" | "AccessLevel" | "AccessEventIDs" | "OriginEventID">): AccessInfo {
  if (item.Scope === "event") return { kind: "event", eventName: item.OwnerEventName, eventIds: [] }
  if (item.AccessLevel === "selected") return { kind: "selected", eventName: "", eventIds: item.AccessEventIDs }
  if (item.AccessLevel === "own") return { kind: "own", eventName: "", eventIds: item.OriginEventID ? [item.OriginEventID] : [] }
  if (item.AccessLevel === "all") return { kind: "all", eventName: "", eventIds: [] }
  if (item.AccessLevel === "none") return { kind: "none", eventName: "", eventIds: [] }
  return { kind: "unknown", eventName: "", eventIds: [] }
}

export type StatusFilter = "all" | "published" | "changed" | "draft" | "archived"
export const STATUS_FILTERS: StatusFilter[] = ["all", "published", "changed", "draft", "archived"]

/** Server status/archived params of a status filter. */
export function statusQuery(status: StatusFilter): { status: string; archived?: "only" } {
  switch (status) {
    case "published": return { status: "published" }
    case "changed": return { status: "changed" }
    case "draft": return { status: "draft_only" }
    case "archived": return { status: "archived", archived: "only" }
    default: return { status: "" }
  }
}

export type SortDir = "asc" | "desc"
export const SORT_FIELDS = ["name", "tags", "status", "updated"] as const

export type CatalogFilters = {
  search: string
  tags: string[]
  status: StatusFilter
  scope: ScopeFilter
  events: string[]
  infrastructure: InfrastructureFilter
  sortBy: string
  sortDir: SortDir
}

export function defaultFilters(isAdmin: boolean): CatalogFilters {
  return { search: "", tags: [], status: "all", scope: isAdmin ? "" : "event", events: [], infrastructure: "", sortBy: "updated", sortDir: "desc" }
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

/** Reads ?q=&tag=&status=&scope=&event=&infra=&sort=&dir= (unknown values → defaults). */
export function filtersFromSearch(search: string, isAdmin: boolean): CatalogFilters {
  const params = new URLSearchParams(search)
  const defaults = defaultFilters(isAdmin)
  const status = params.get("status") as StatusFilter | null
  const scope = params.get("scope")
  const infra = params.get("infra")
  const sortBy = params.get("sort")
  const sortDir = params.get("dir")
  return {
    search: params.get("q")?.trim() ?? "",
    tags: unique(params.getAll("tag")),
    status: status && STATUS_FILTERS.includes(status) && (status !== "archived" || isAdmin) ? status : defaults.status,
    scope: scope === "catalog" || scope === "event" ? scope : scope === "all" && isAdmin ? "" : defaults.scope,
    events: unique(params.getAll("event")),
    infrastructure: infra === "yes" || infra === "no" ? infra : "",
    sortBy: sortBy && (SORT_FIELDS as readonly string[]).includes(sortBy) ? sortBy : defaults.sortBy,
    sortDir: sortDir === "asc" || sortDir === "desc" ? sortDir : defaults.sortDir,
  }
}

/** The query string for the filters; defaults are left out. */
export function filtersToSearch(filters: CatalogFilters, isAdmin: boolean): string {
  const defaults = defaultFilters(isAdmin)
  const params = new URLSearchParams()
  if (filters.search) params.set("q", filters.search)
  for (const tag of filters.tags) params.append("tag", tag)
  if (filters.status !== defaults.status) params.set("status", filters.status)
  if (filters.scope !== defaults.scope) params.set("scope", filters.scope || "all")
  for (const event of filters.events) params.append("event", event)
  if (filters.infrastructure) params.set("infra", filters.infrastructure)
  if (filters.sortBy !== defaults.sortBy || filters.sortDir !== defaults.sortDir) {
    params.set("sort", filters.sortBy)
    params.set("dir", filters.sortDir)
  }
  return params.toString()
}

export type PageFetcher = (filter: ExercisesPageFilter) => Promise<OffsetPage<ExerciseListItem>>

/** The server accepts up to 100 events per request. */
export const MAX_EVENTS = 100

/** One table page for the filters, straight from the server. */
export function loadCatalogPage(fetchPage: PageFetcher, filters: CatalogFilters, page: number, pageSize: number): Promise<OffsetPage<ExerciseListItem>> {
  const { status, archived } = statusQuery(filters.status)
  return fetchPage({
    search: filters.search, tags: filters.tags, status, archived,
    ...(filters.scope ? { scope: filters.scope } : {}),
    ...(filters.events.length ? { events: filters.events.slice(0, MAX_EVENTS) } : {}),
    ...(filters.infrastructure ? { infrastructure: filters.infrastructure } : {}),
    sortBy: filters.sortBy, sortDir: filters.sortDir, page, pageSize,
  })
}
