/**
 * catalogList.ts — catalog table rules: one status per row, the access label,
 * the filters ↔ URL mapping and the list query.
 *
 * The API filters by one event and knows only the "draft" / "published" /
 * "none" statuses. Several events, «Є зміни в чернетці» and «Лише чернетка»
 * are answered here: every matching row is loaded per event (the server still
 * decides what each event can use), merged, filtered, sorted and paged locally.
 */
import type { ExerciseListItem, InfrastructureFilter, ScopeFilter, ExercisesPageFilter } from "@/api/exercises/catalog"
import type { OffsetPage } from "@/api/pagination"

/** The single status shown in the table. */
export type CatalogStatus = "published" | "changed" | "draft" | "archived" | "none"

export function catalogStatus(item: Pick<ExerciseListItem, "ArchivedAt" | "HasDraft" | "HasPublished">): CatalogStatus {
  if (item.ArchivedAt) return "archived"
  if (item.HasPublished) return item.HasDraft ? "changed" : "published"
  return item.HasDraft ? "draft" : "none"
}

export type AccessKind = "event" | "all" | "selected" | "own" | "none"
export type AccessInfo = { kind: AccessKind; eventName: string; eventIds: string[] }

/** Who can use the exercise: its owner event, or the catalog access level. */
export function accessInfo(item: Pick<ExerciseListItem, "Scope" | "OwnerEventName" | "AccessLevel" | "AccessEventIDs" | "OriginEventID">): AccessInfo {
  if (item.Scope === "event") return { kind: "event", eventName: item.OwnerEventName, eventIds: [] }
  if (item.AccessLevel === "selected") return { kind: "selected", eventName: "", eventIds: item.AccessEventIDs }
  if (item.AccessLevel === "own") return { kind: "own", eventName: "", eventIds: item.OriginEventID ? [item.OriginEventID] : [] }
  if (item.AccessLevel === "all") return { kind: "all", eventName: "", eventIds: [] }
  return { kind: "none", eventName: "", eventIds: [] }
}

export type StatusFilter = "all" | "published" | "changed" | "draft" | "archived"
export const STATUS_FILTERS: StatusFilter[] = ["all", "published", "changed", "draft", "archived"]

/** The server part of a status filter, plus the row test the server cannot do. */
export function statusQuery(status: StatusFilter): { status: string; archived?: "only"; keep?: (item: ExerciseListItem) => boolean } {
  switch (status) {
    case "published": return { status: "published" }
    case "changed": return { status: "published", keep: (item) => item.HasDraft }
    case "draft": return { status: "draft", keep: (item) => !item.HasPublished }
    case "archived": return { status: "", archived: "only" }
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

function statusRank(item: ExerciseListItem): number {
  // Same order as the server: published > draft > nothing.
  return item.HasPublished ? 2 : item.HasDraft ? 1 : 0
}

/** Local sort matching the server's ORDER BY (ties: newest first, then id). */
export function compareExercises(sortBy: string, sortDir: SortDir): (a: ExerciseListItem, b: ExerciseListItem) => number {
  const sign = sortDir === "asc" ? 1 : -1
  const primary = (a: ExerciseListItem, b: ExerciseListItem): number => {
    switch (sortBy) {
      case "name": return a.Name.toLocaleLowerCase("uk").localeCompare(b.Name.toLocaleLowerCase("uk"), "uk")
      case "tags": return a.Tags.join(",").toLocaleLowerCase("uk").localeCompare(b.Tags.join(",").toLocaleLowerCase("uk"), "uk")
      case "status": return statusRank(a) - statusRank(b)
      default: return a.UpdatedAt.localeCompare(b.UpdatedAt)
    }
  }
  return (a, b) => sign * primary(a, b) || b.UpdatedAt.localeCompare(a.UpdatedAt) || (a.ID < b.ID ? 1 : a.ID > b.ID ? -1 : 0)
}

/** Union of several lists by exercise ID, first occurrence wins. */
export function mergeById(lists: ExerciseListItem[][]): ExerciseListItem[] {
  const seen = new Map<string, ExerciseListItem>()
  for (const list of lists) for (const item of list) if (!seen.has(item.ID)) seen.set(item.ID, item)
  return [...seen.values()]
}

export type PageFetcher = (filter: ExercisesPageFilter) => Promise<OffsetPage<ExerciseListItem>>

/** Server page size limit (pkg/pagination.MaxPageSize) and a safety cap for local merging. */
export const MERGE_PAGE_SIZE = 200
export const MERGE_MAX_PAGES = 10

export function needsLocalMerge(filters: Pick<CatalogFilters, "events" | "status">): boolean {
  return filters.events.length > 1 || Boolean(statusQuery(filters.status).keep)
}

async function fetchAll(fetchPage: PageFetcher, filter: Omit<ExercisesPageFilter, "page" | "pageSize">): Promise<ExerciseListItem[]> {
  const items: ExerciseListItem[] = []
  for (let page = 1; page <= MERGE_MAX_PAGES; page++) {
    const res = await fetchPage({ ...filter, page, pageSize: MERGE_PAGE_SIZE })
    items.push(...res.Items)
    if (res.Items.length < MERGE_PAGE_SIZE || items.length >= res.Total) break
  }
  return items
}

/** One table page for the filters: straight from the server, or merged locally (see file header). */
export async function loadCatalogPage(
  fetchPage: PageFetcher,
  filters: CatalogFilters,
  page: number,
  pageSize: number,
): Promise<OffsetPage<ExerciseListItem>> {
  const { status, archived, keep } = statusQuery(filters.status)
  const base = {
    search: filters.search, tags: filters.tags, status, archived,
    ...(filters.scope ? { scope: filters.scope } : {}),
    ...(filters.infrastructure ? { infrastructure: filters.infrastructure } : {}),
    sortBy: filters.sortBy, sortDir: filters.sortDir,
  }
  if (!needsLocalMerge(filters)) {
    return fetchPage({ ...base, ...(filters.events[0] ? { event: filters.events[0] } : {}), page, pageSize })
  }
  const targets = filters.events.length > 0 ? filters.events : [""]
  const lists = await Promise.all(targets.map((event) => fetchAll(fetchPage, { ...base, ...(event ? { event } : {}) })))
  const rows = mergeById(lists).filter((item) => !keep || keep(item)).sort(compareExercises(filters.sortBy, filters.sortDir))
  const start = (page - 1) * pageSize
  return { Items: rows.slice(start, start + pageSize), Total: rows.length, Page: page, PageSize: pageSize }
}
