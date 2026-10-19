import { describe, expect, it, vi } from "vitest"
import type { Exercise, ExerciseListItem, ExercisesPageFilter } from "@/api/exercises/catalog"
import { LIST_EXTRAS, OWNERSHIP } from "@/test/exerciseFixtures"
import {
  accessInfo, catalogStatus, clearedFilters, countActiveFilters, defaultFilters, difficultyLevel, difficultyName, filtersFromSearch, filtersToSearch,
  hasActiveFilters, loadCatalogPage, MAX_AUTHORS, MAX_EVENTS, mergeCardIntoRow, statusQuery, type CatalogFilters,
} from "./catalogList"

function row(id: string, patch: Partial<ExerciseListItem> = {}): ExerciseListItem {
  return {
    ...OWNERSHIP, ...LIST_EXTRAS, ID: id, Name: id, Description: "", Tags: [], HasDraft: false, HasPublished: true, Status: null,
    ArchivedAt: null, CreatedAt: "2026-01-01T00:00:00Z", UpdatedAt: "2026-01-01T00:00:00Z", ...patch,
  }
}

describe("catalogStatus", () => {
  it("uses the server status when present", () => {
    expect(catalogStatus({ ArchivedAt: null, HasDraft: true, HasPublished: true, Status: "published" })).toBe("published")
    expect(catalogStatus({ ArchivedAt: null, HasDraft: true, HasPublished: false, Status: "draft_only" })).toBe("draft")
    expect(catalogStatus({ ArchivedAt: null, HasDraft: false, HasPublished: false, Status: "changed" })).toBe("changed")
  })

  it("gives one status per row", () => {
    expect(catalogStatus({ ArchivedAt: null, HasDraft: false, HasPublished: true })).toBe("published")
    expect(catalogStatus({ ArchivedAt: null, HasDraft: true, HasPublished: true })).toBe("changed")
    expect(catalogStatus({ ArchivedAt: null, HasDraft: true, HasPublished: false })).toBe("draft")
    expect(catalogStatus({ ArchivedAt: null, HasDraft: false, HasPublished: false })).toBe("none")
  })

  it("puts archive above the version state", () => {
    expect(catalogStatus({ ArchivedAt: "2026-09-01T00:00:00Z", HasDraft: true, HasPublished: true })).toBe("archived")
  })
})

describe("accessInfo", () => {
  it("names the owner event of an event exercise", () => {
    expect(accessInfo({ ...OWNERSHIP, Scope: "event", OwnerEventName: "Winter CTF", AccessLevel: "" }))
      .toEqual({ kind: "event", eventName: "Winter CTF", eventIds: [] })
  })

  it("maps catalog access levels", () => {
    expect(accessInfo({ ...OWNERSHIP, AccessLevel: "all" }).kind).toBe("all")
    expect(accessInfo({ ...OWNERSHIP, AccessLevel: "selected", AccessEventIDs: ["e1", "e2"] }))
      .toEqual({ kind: "selected", eventName: "", eventIds: ["e1", "e2"] })
    expect(accessInfo({ ...OWNERSHIP, AccessLevel: "own", OriginEventID: "e9" }))
      .toEqual({ kind: "own", eventName: "", eventIds: ["e9"] })
    expect(accessInfo({ ...OWNERSHIP, AccessLevel: "none" }).kind).toBe("none")
    expect(accessInfo({ ...OWNERSHIP, AccessLevel: "" }).kind).toBe("unknown")
  })
})

describe("filters and the URL", () => {
  it("round-trips every filter", () => {
    const filters: CatalogFilters = {
      search: "sql", tags: ["web", "crypto"], notTags: ["legacy"], statuses: ["changed", "archived"], authors: ["u1", "u2"],
      difficultyMin: 2, difficultyMax: 4, scope: "catalog", events: ["e1", "e2"], infrastructure: "no", sortBy: "difficulty", sortDir: "asc",
    }
    const query = filtersToSearch(filters, true)
    expect(query).toBe("q=sql&tag=web&tag=crypto&notag=legacy&status=changed&status=archived&author=u1&author=u2&dmin=2&dmax=4&scope=catalog&event=e1&event=e2&infra=no&sort=difficulty&dir=asc")
    expect(filtersFromSearch(query, true)).toEqual(filters)
  })

  it("leaves defaults out of the URL", () => {
    expect(filtersToSearch(defaultFilters(true), true)).toBe("")
    expect(filtersToSearch(defaultFilters(false), false)).toBe("")
    expect(filtersToSearch({ ...defaultFilters(false), scope: "catalog" }, false)).toBe("scope=catalog")
    expect(filtersToSearch({ ...defaultFilters(true), scope: "event" }, true)).toBe("scope=event")
  })

  it("keeps old links: a single ?event= and ?status=, comma-separated statuses", () => {
    expect(filtersFromSearch("?event=ev1", false).events).toEqual(["ev1"])
    expect(filtersFromSearch("?status=published", false).statuses).toEqual(["published"])
    expect(filtersFromSearch("?status=published,draft&status=draft", false).statuses).toEqual(["published", "draft"])
  })

  it("ignores unknown values", () => {
    const parsed = filtersFromSearch("?status=bogus&status=all&scope=all&infra=maybe&sort=owner&dir=up&dmin=0&dmax=7&notag=", false)
    expect(parsed).toEqual(defaultFilters(false))
    expect(filtersFromSearch("?dmin=two&dmax=3.5", true)).toMatchObject({ difficultyMin: null, difficultyMax: null })
  })

  it("keeps the subtasks sort in the URL", () => {
    expect(filtersFromSearch("?sort=subtasks&dir=desc", true)).toMatchObject({ sortBy: "subtasks", sortDir: "desc" })
  })

  it("swaps a reversed difficulty range", () => {
    expect(filtersFromSearch("?dmin=5&dmax=2", true)).toMatchObject({ difficultyMin: 2, difficultyMax: 5 })
    expect(filtersFromSearch("?dmax=3", true)).toMatchObject({ difficultyMin: null, difficultyMax: 3 })
  })

  it("never keeps one tag both wanted and left out", () => {
    expect(filtersFromSearch("?tag=web&notag=web&notag=old", true)).toMatchObject({ tags: ["web"], notTags: ["old"] })
  })

  it("offers the archive only to admins", () => {
    expect(filtersFromSearch("?status=archived", true).statuses).toEqual(["archived"])
    expect(filtersFromSearch("?status=archived&status=published", false).statuses).toEqual(["published"])
  })

  it("counts the set filters and clears them, keeping the search and sorting", () => {
    const set: CatalogFilters = { ...defaultFilters(true), search: "x", tags: ["web"], notTags: ["old"], statuses: ["draft"], difficultyMax: 3, sortBy: "name", sortDir: "asc" }
    expect(countActiveFilters(set, true)).toBe(4)
    expect(countActiveFilters({ ...defaultFilters(false), scope: "catalog" }, false)).toBe(1)
    expect(hasActiveFilters({ ...defaultFilters(true), search: "x" }, true)).toBe(true)
    expect(hasActiveFilters(defaultFilters(true), true)).toBe(false)
    expect(clearedFilters(set, true)).toEqual({ ...defaultFilters(true), search: "x", sortBy: "name", sortDir: "asc" })
  })
})

describe("difficulty level", () => {
  it("rounds the average half up to a level 1..6", () => {
    expect(difficultyLevel(1)).toBe(1)
    expect(difficultyLevel(2.49)).toBe(2)
    expect(difficultyLevel(2.5)).toBe(3)
    expect(difficultyLevel(5.5)).toBe(6)
    expect(difficultyLevel(0.2)).toBe(1)
    expect(difficultyLevel(9)).toBe(6)
    expect(difficultyName(3.33)).toBe("easy")
    expect(difficultyName(3.5)).toBe("medium")
  })
})

describe("server query", () => {
  const filters = (patch: Partial<CatalogFilters>): CatalogFilters => ({ ...defaultFilters(true), ...patch })

  it("maps status filters to the server values", () => {
    expect(statusQuery([])).toEqual([])
    expect(statusQuery(["published", "changed", "draft", "archived"])).toEqual(["published", "changed", "draft_only", "archived"])
  })

  it("sends every filter in one paged request", async () => {
    const fetchPage = vi.fn(async (filter: ExercisesPageFilter) => ({ Items: [row("a")], Total: 7, Page: filter.page, PageSize: filter.pageSize }))
    const res = await loadCatalogPage(fetchPage, filters({
      events: ["e1", "e2"], scope: "catalog", statuses: ["changed", "draft"], sortBy: "author", tags: ["web"], notTags: ["old"],
      authors: ["u1"], difficultyMin: 2, difficultyMax: 5,
    }), 2, 25)
    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(fetchPage).toHaveBeenCalledWith(expect.objectContaining({
      events: ["e1", "e2"], scope: "catalog", statuses: ["changed", "draft_only"], sortBy: "author", page: 2, pageSize: 25,
      withTags: ["web"], withoutTags: ["old"], authors: ["u1"], difficultyMin: 2, difficultyMax: 5,
    }))
    expect(res.Total).toBe(7)
  })

  it("leaves unset filters out and caps events and authors at the server limit", async () => {
    const fetchPage = vi.fn(async (filter: ExercisesPageFilter) => ({ Items: [], Total: 0, Page: filter.page, PageSize: filter.pageSize }))
    await loadCatalogPage(fetchPage, filters({}), 1, 50)
    for (const key of ["events", "statuses", "authors", "withTags", "withoutTags", "difficultyMin", "difficultyMax"]) {
      expect(fetchPage.mock.calls[0][0]).not.toHaveProperty(key)
    }
    const many = (prefix: string) => Array.from({ length: MAX_EVENTS + 5 }, (_, i) => `${prefix}${i}`)
    await loadCatalogPage(fetchPage, filters({ events: many("e"), authors: many("u") }), 1, 50)
    expect(fetchPage.mock.calls[1][0].events).toHaveLength(MAX_EVENTS)
    expect(fetchPage.mock.calls[1][0].authors).toHaveLength(MAX_AUTHORS)
  })
})

describe("mergeCardIntoRow", () => {
  const card = (patch: Partial<Exercise>): Exercise => ({
    ...OWNERSHIP, ID: "a", Name: "a", Description: "", Tags: [], DraftVersionID: null, PublishedVersionID: "v1", ArchivedAt: null, HasChanges: false,
    CreatedAt: "", CreatedBy: null, UpdatedAt: "2026-10-19T10:00:00Z", UpdatedBy: null, ...patch,
  })

  it("takes the archive mark, the access and the update time from the changed card, keeps the row's own fields", () => {
    const permissions = { CanRead: true, CanEdit: true, CanPublish: true, CanDelete: true, CanManageAccess: true, CanPropose: false, CanExport: true }
    const merged = mergeCardIntoRow(row("a", { Status: "published", AuthorName: "Ann", AvgDifficulty: 3, Permissions: permissions }),
      card({ ArchivedAt: "2026-10-19T10:00:00Z", AccessLevel: "selected", AccessEventIDs: ["e1"], AccessEvents: [{ ID: "e1", Name: "Winter" }] }))
    expect(merged).toMatchObject({ ArchivedAt: "2026-10-19T10:00:00Z", Status: "archived", AccessLevel: "selected", AccessEventIDs: ["e1"],
      UpdatedAt: "2026-10-19T10:00:00Z", AuthorName: "Ann", AvgDifficulty: 3, Permissions: permissions })
  })

  it("derives the status of an unarchived task from its card", () => {
    expect(mergeCardIntoRow(row("a", { Status: "archived", ArchivedAt: "x" }), card({ HasChanges: true })).Status).toBe("changed")
    expect(mergeCardIntoRow(row("a", { Status: "archived", ArchivedAt: "x" }), card({})).Status).toBe("published")
    expect(mergeCardIntoRow(row("a", { Status: "archived", ArchivedAt: "x" }), card({ PublishedVersionID: null, DraftVersionID: "d" })).Status).toBe("draft_only")
  })

  it("keeps the row's status when only the access changed", () => {
    expect(mergeCardIntoRow(row("a", { Status: "changed" }), card({ AccessLevel: "none" })).Status).toBe("changed")
  })
})
