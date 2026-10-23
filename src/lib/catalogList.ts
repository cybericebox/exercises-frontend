/**
 * catalogList.ts — catalog table rules: one status per row, the access label,
 * the difficulty level, the filters ↔ URL mapping and the list query. Filtering,
 * paging and sorting (several events, statuses and authors, tags with all of /
 * none of, the difficulty range) happen on the server.
 */
import type { Exercise, ExerciseListItem, ExerciseStatus, InfrastructureFilter, ScopeFilter, ExercisesPageFilter } from "@/api/exercises/catalog"
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

const TO_SERVER: Record<CatalogStatus, ExerciseStatus> = {
  none: "none", draft: "draft_only", changed: "changed", published: "published", archived: "archived",
}

/**
 * A table row after a bulk action changed its task: the archive mark, the access and the update time come from the
 * changed card; the list-only fields (author, difficulty, the caller's rights) stay. An unarchived task gets its
 * status from the card; after an access change the row's status stays.
 */
export function mergeCardIntoRow(row: ExerciseListItem, card: Exercise): ExerciseListItem {
  const archiveChanged = Boolean(row.ArchivedAt) !== Boolean(card.ArchivedAt)
  return {
    ...row, ArchivedAt: card.ArchivedAt, UpdatedAt: card.UpdatedAt || row.UpdatedAt,
    AccessLevel: card.AccessLevel, AccessEventIDs: card.AccessEventIDs, AccessEvents: card.AccessEvents,
    Status: card.ArchivedAt ? "archived" : archiveChanged || row.Status === "archived" ? TO_SERVER[headerStatus(card)] : row.Status,
  }
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

/** A status the table filters by (several at once; none chosen = every active task). */
export type StatusFilter = "published" | "changed" | "draft" | "archived"
export const STATUS_FILTERS: StatusFilter[] = ["published", "changed", "draft", "archived"]

const STATUS_PARAM: Record<StatusFilter, ExerciseStatus> = {
  published: "published", changed: "changed", draft: "draft_only", archived: "archived",
}

/** Server statuses of the chosen ones; archived among them lists archived tasks too (alone: only those). */
export function statusQuery(statuses: StatusFilter[]): string[] {
  return statuses.map((status) => STATUS_PARAM[status])
}

/** Difficulty levels, easiest first: the average is shown as the level it rounds to. */
export const DIFFICULTY_LEVELS = ["elementary", "trivial", "easy", "medium", "hard", "insane"] as const
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number]

/** The level (1..6) an average rounds to (half up, like the server filter). */
export function difficultyLevel(average: number): number {
  return Math.min(6, Math.max(1, Math.floor(average + 0.5)))
}

/** The level name of an average. */
export function difficultyName(average: number): DifficultyLevel {
  return DIFFICULTY_LEVELS[difficultyLevel(average) - 1]
}

export type SortDir = "asc" | "desc"
export const SORT_FIELDS = ["name", "author", "tags", "subtasks", "variants", "difficulty", "status", "updated"] as const

/** How the chosen tags combine: every one of them, or at least one. */
export type TagMode = "all" | "any"

export type CatalogFilters = {
  search: string
  /** Tasks having every one of these tags («all»), or at least one of them («any»). */
  tags: string[]
  tagMode: TagMode
  /** Tasks having none of these tags. */
  notTags: string[]
  statuses: StatusFilter[]
  authors: string[]
  /** The rounded average difficulty, levels 1..6 inclusive; null = no bound. */
  difficultyMin: number | null
  difficultyMax: number | null
  scope: ScopeFilter
  events: string[]
  infrastructure: InfrastructureFilter
  sortBy: string
  sortDir: SortDir
}

export function defaultFilters(isAdmin: boolean): CatalogFilters {
  return {
    search: "", tags: [], tagMode: "all", notTags: [], statuses: [], authors: [], difficultyMin: null, difficultyMax: null,
    scope: isAdmin ? "" : "event", events: [], infrastructure: "", sortBy: "updated", sortDir: "desc",
  }
}

/** Whether any filter narrows the list (search included, sorting not). */
export function hasActiveFilters(filters: CatalogFilters, isAdmin: boolean): boolean {
  return countActiveFilters(filters, isAdmin) > 0 || Boolean(filters.search)
}

/** How many filters (not the search) differ from the defaults: the count on the phone filter button. */
export function countActiveFilters(filters: CatalogFilters, isAdmin: boolean): number {
  const defaults = defaultFilters(isAdmin)
  return [
    filters.tags.length > 0, filters.notTags.length > 0, filters.statuses.length > 0, filters.authors.length > 0,
    filters.difficultyMin !== null || filters.difficultyMax !== null, filters.scope !== defaults.scope,
    filters.events.length > 0, Boolean(filters.infrastructure),
  ].filter(Boolean).length
}

/** Every filter back to its default; the search and the sorting stay. */
export function clearedFilters(filters: CatalogFilters, isAdmin: boolean): CatalogFilters {
  return { ...defaultFilters(isAdmin), search: filters.search, sortBy: filters.sortBy, sortDir: filters.sortDir, tagMode: filters.tagMode }
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function level(raw: string | null): number | null {
  const value = raw === null || raw.trim() === "" ? NaN : Number(raw)
  return Number.isInteger(value) && value >= 1 && value <= 6 ? value : null
}

/**
 * Reads ?q=&tag=&tagmode=&notag=&status=&author=&dmin=&dmax=&scope=&event=&infra=&sort=&dir= (repeated params for lists;
 * unknown values → defaults). A reversed difficulty range is swapped.
 */
export function filtersFromSearch(search: string, isAdmin: boolean): CatalogFilters {
  const params = new URLSearchParams(search)
  const defaults = defaultFilters(isAdmin)
  const scope = params.get("scope")
  const infra = params.get("infra")
  const sortBy = params.get("sort")
  const sortDir = params.get("dir")
  const statuses = unique(params.getAll("status").flatMap((value) => value.split(",")))
    .filter((status): status is StatusFilter => (STATUS_FILTERS as string[]).includes(status) && (status !== "archived" || isAdmin))
  const tags = unique(params.getAll("tag"))
  let min = level(params.get("dmin"))
  let max = level(params.get("dmax"))
  if (min !== null && max !== null && min > max) [min, max] = [max, min]
  return {
    search: params.get("q")?.trim() ?? "",
    tags,
    tagMode: params.get("tagmode") === "any" ? "any" : "all",
    notTags: unique(params.getAll("notag")).filter((tag) => !tags.includes(tag)),
    statuses,
    authors: unique(params.getAll("author")),
    difficultyMin: min,
    difficultyMax: max,
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
  if (filters.tagMode === "any" && filters.tags.length) params.set("tagmode", "any")
  for (const tag of filters.notTags) params.append("notag", tag)
  for (const status of filters.statuses) params.append("status", status)
  for (const author of filters.authors) params.append("author", author)
  if (filters.difficultyMin !== null) params.set("dmin", String(filters.difficultyMin))
  if (filters.difficultyMax !== null) params.set("dmax", String(filters.difficultyMax))
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

/** The server accepts up to 100 events and 100 authors per request. */
export const MAX_EVENTS = 100
export const MAX_AUTHORS = 100

/** One table page for the filters, straight from the server. */
export function loadCatalogPage(fetchPage: PageFetcher, filters: CatalogFilters, page: number, pageSize: number): Promise<OffsetPage<ExerciseListItem>> {
  return fetchPage({
    search: filters.search,
    ...(filters.tags.length ? filters.tagMode === "any" ? { tags: filters.tags } : { withTags: filters.tags } : {}),
    ...(filters.notTags.length ? { withoutTags: filters.notTags } : {}),
    ...(filters.statuses.length ? { statuses: statusQuery(filters.statuses) } : {}),
    ...(filters.authors.length ? { authors: filters.authors.slice(0, MAX_AUTHORS) } : {}),
    ...(filters.difficultyMin !== null ? { difficultyMin: filters.difficultyMin } : {}),
    ...(filters.difficultyMax !== null ? { difficultyMax: filters.difficultyMax } : {}),
    ...(filters.scope ? { scope: filters.scope } : {}),
    ...(filters.events.length ? { events: filters.events.slice(0, MAX_EVENTS) } : {}),
    ...(filters.infrastructure ? { infrastructure: filters.infrastructure } : {}),
    sortBy: filters.sortBy, sortDir: filters.sortDir, page, pageSize,
  })
}
