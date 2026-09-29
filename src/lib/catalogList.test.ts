import { describe, expect, it, vi } from "vitest"
import type { ExerciseListItem, ExercisesPageFilter } from "@/api/exercises/catalog"
import { OWNERSHIP } from "@/test/exerciseFixtures"
import {
  accessInfo, catalogStatus, defaultFilters, filtersFromSearch, filtersToSearch, loadCatalogPage, MAX_EVENTS, statusQuery, type CatalogFilters,
} from "./catalogList"

function row(id: string, patch: Partial<ExerciseListItem> = {}): ExerciseListItem {
  return {
    ...OWNERSHIP, ID: id, Name: id, Description: "", Tags: [], HasDraft: false, HasPublished: true, Status: null,
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
      search: "sql", tags: ["web", "crypto"], status: "changed", scope: "catalog", events: ["e1", "e2"],
      infrastructure: "no", sortBy: "name", sortDir: "asc",
    }
    const query = filtersToSearch(filters, true)
    expect(query).toBe("q=sql&tag=web&tag=crypto&status=changed&scope=catalog&event=e1&event=e2&infra=no&sort=name&dir=asc")
    expect(filtersFromSearch(query, true)).toEqual(filters)
  })

  it("leaves defaults out of the URL", () => {
    expect(filtersToSearch(defaultFilters(true), true)).toBe("")
    expect(filtersToSearch(defaultFilters(false), false)).toBe("")
    expect(filtersToSearch({ ...defaultFilters(false), scope: "catalog" }, false)).toBe("scope=catalog")
    expect(filtersToSearch({ ...defaultFilters(true), scope: "event" }, true)).toBe("scope=event")
  })

  it("keeps the old single ?event= link and ignores unknown values", () => {
    expect(filtersFromSearch("?event=ev1", false).events).toEqual(["ev1"])
    const parsed = filtersFromSearch("?status=bogus&scope=all&infra=maybe&sort=owner&dir=up", false)
    expect(parsed).toEqual(defaultFilters(false))
  })

  it("offers the archive only to admins", () => {
    expect(filtersFromSearch("?status=archived", true).status).toBe("archived")
    expect(filtersFromSearch("?status=archived", false).status).toBe("all")
  })
})

describe("server query", () => {
  const filters = (patch: Partial<CatalogFilters>): CatalogFilters => ({ ...defaultFilters(true), ...patch })

  it("maps status filters to the server values", () => {
    expect(statusQuery("all")).toEqual({ status: "" })
    expect(statusQuery("published")).toEqual({ status: "published" })
    expect(statusQuery("changed")).toEqual({ status: "changed" })
    expect(statusQuery("draft")).toEqual({ status: "draft_only" })
    expect(statusQuery("archived")).toEqual({ status: "archived", archived: "only" })
  })

  it("sends every selected event in one paged request", async () => {
    const fetchPage = vi.fn(async (filter: ExercisesPageFilter) => ({ Items: [row("a")], Total: 7, Page: filter.page, PageSize: filter.pageSize }))
    const res = await loadCatalogPage(fetchPage, filters({ events: ["e1", "e2"], scope: "catalog", status: "changed", sortBy: "status" }), 2, 25)
    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(fetchPage).toHaveBeenCalledWith(expect.objectContaining({
      events: ["e1", "e2"], scope: "catalog", status: "changed", sortBy: "status", page: 2, pageSize: 25,
    }))
    expect(res.Total).toBe(7)
  })

  it("leaves events out when none are selected and caps them at the server limit", async () => {
    const fetchPage = vi.fn(async (filter: ExercisesPageFilter) => ({ Items: [], Total: 0, Page: filter.page, PageSize: filter.pageSize }))
    await loadCatalogPage(fetchPage, filters({}), 1, 50)
    expect(fetchPage.mock.calls[0][0]).not.toHaveProperty("events")
    await loadCatalogPage(fetchPage, filters({ events: Array.from({ length: MAX_EVENTS + 5 }, (_, i) => `e${i}`) }), 1, 50)
    expect(fetchPage.mock.calls[1][0].events).toHaveLength(MAX_EVENTS)
  })
})
