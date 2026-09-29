import { describe, expect, it, vi } from "vitest"
import type { ExerciseListItem, ExercisesPageFilter } from "@/api/exercises/catalog"
import { OWNERSHIP } from "@/test/exerciseFixtures"
import {
  accessInfo, catalogStatus, compareExercises, defaultFilters, filtersFromSearch, filtersToSearch,
  loadCatalogPage, MERGE_PAGE_SIZE, mergeById, needsLocalMerge, type CatalogFilters,
} from "./catalogList"

function row(id: string, patch: Partial<ExerciseListItem> = {}): ExerciseListItem {
  return {
    ...OWNERSHIP, ID: id, Name: id, Description: "", Tags: [], HasDraft: false, HasPublished: true,
    ArchivedAt: null, CreatedAt: "2026-01-01T00:00:00Z", UpdatedAt: "2026-01-01T00:00:00Z", ...patch,
  }
}

describe("catalogStatus", () => {
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

describe("compareExercises", () => {
  it("sorts by status like the server and breaks ties by newest", () => {
    const rows = [
      row("none", { HasPublished: false }),
      row("pub-old", { UpdatedAt: "2026-01-01T00:00:00Z" }),
      row("draft", { HasPublished: false, HasDraft: true }),
      row("pub-new", { UpdatedAt: "2026-02-01T00:00:00Z", HasDraft: true }),
    ]
    expect(rows.sort(compareExercises("status", "desc")).map((item) => item.ID)).toEqual(["pub-new", "pub-old", "draft", "none"])
  })
})

describe("event multi-filter", () => {
  const filters = (patch: Partial<CatalogFilters>): CatalogFilters => ({ ...defaultFilters(true), ...patch })

  it("merges only when the server cannot answer", () => {
    expect(needsLocalMerge({ events: [], status: "all" })).toBe(false)
    expect(needsLocalMerge({ events: ["e1"], status: "published" })).toBe(false)
    expect(needsLocalMerge({ events: ["e1", "e2"], status: "all" })).toBe(true)
    expect(needsLocalMerge({ events: [], status: "changed" })).toBe(true)
    expect(needsLocalMerge({ events: [], status: "draft" })).toBe(true)
  })

  it("asks the server directly for one event", async () => {
    const fetchPage = vi.fn(async (filter: ExercisesPageFilter) => ({ Items: [row("a")], Total: 7, Page: filter.page, PageSize: filter.pageSize }))
    const res = await loadCatalogPage(fetchPage, filters({ events: ["e1"], scope: "catalog" }), 2, 25)
    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(fetchPage).toHaveBeenCalledWith(expect.objectContaining({ event: "e1", scope: "catalog", page: 2, pageSize: 25, status: "" }))
    expect(res.Total).toBe(7)
  })

  it("unions what each selected event can use, without duplicates, then pages locally", async () => {
    const byEvent: Record<string, ExerciseListItem[]> = {
      e1: [row("shared"), row("own-1", { Scope: "event", OwnerEventID: "e1" })],
      e2: [row("shared"), row("sel-2", { AccessLevel: "selected" }), row("own-2", { Scope: "event", OwnerEventID: "e2" })],
    }
    const fetchPage = vi.fn(async (filter: ExercisesPageFilter) => {
      const items = byEvent[filter.event ?? ""] ?? []
      return { Items: items, Total: items.length, Page: filter.page, PageSize: filter.pageSize }
    })
    const res = await loadCatalogPage(fetchPage, filters({ events: ["e1", "e2"], sortBy: "name", sortDir: "asc" }), 1, 3)
    expect(fetchPage).toHaveBeenCalledTimes(2)
    expect(fetchPage).toHaveBeenCalledWith(expect.objectContaining({ event: "e1", page: 1, pageSize: MERGE_PAGE_SIZE }))
    expect(res.Total).toBe(4)
    expect(res.Items.map((item) => item.ID)).toEqual(["own-1", "own-2", "sel-2"])
    const second = await loadCatalogPage(fetchPage, filters({ events: ["e1", "e2"], sortBy: "name", sortDir: "asc" }), 2, 3)
    expect(second.Items.map((item) => item.ID)).toEqual(["shared"])
  })

  it("filters draft-only and changed rows the server returns for draft / published", async () => {
    const fetchPage = vi.fn(async (filter: ExercisesPageFilter) => {
      const items = filter.status === "draft"
        ? [row("draft-only", { HasDraft: true, HasPublished: false }), row("changed", { HasDraft: true })]
        : [row("published"), row("changed", { HasDraft: true })]
      return { Items: items, Total: items.length, Page: 1, PageSize: MERGE_PAGE_SIZE }
    })
    expect((await loadCatalogPage(fetchPage, filters({ status: "draft" }), 1, 50)).Items.map((item) => item.ID)).toEqual(["draft-only"])
    expect((await loadCatalogPage(fetchPage, filters({ status: "changed" }), 1, 50)).Items.map((item) => item.ID)).toEqual(["changed"])
    expect(fetchPage).not.toHaveBeenCalledWith(expect.objectContaining({ event: expect.anything() }))
  })

  it("reads every server page while merging", async () => {
    const all = Array.from({ length: MERGE_PAGE_SIZE + 5 }, (_, i) => row(`r${String(i).padStart(3, "0")}`))
    const fetchPage = vi.fn(async (filter: ExercisesPageFilter) => {
      const start = (filter.page - 1) * filter.pageSize
      return { Items: all.slice(start, start + filter.pageSize), Total: all.length, Page: filter.page, PageSize: filter.pageSize }
    })
    const res = await loadCatalogPage(fetchPage, filters({ events: ["e1", "e2"] }), 1, 50)
    expect(fetchPage).toHaveBeenCalledTimes(4)
    expect(res.Total).toBe(all.length)
  })

  it("dedupes by ID keeping the first copy", () => {
    expect(mergeById([[row("a", { Name: "first" })], [row("a", { Name: "second" }), row("b")]]).map((item) => item.Name)).toEqual(["first", "b"])
  })
})
