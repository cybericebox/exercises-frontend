// Inbox categories (docs/INBOX-DESIGN.md §3, §8): tolerant parsing, default tab per app,
// request ordering, optimistic counts and the resolved line keys. A copy of main-frontend's tests.
import { expect, it } from "vitest"
import en from "../../../messages/en.json"
import uk from "../../../messages/uk.json"
import * as inbox from "./inboxModel"
import type { InboxMessage as Message } from "./inboxModel"

const catalogs: Record<string, Record<string, string>> = { uk, en }
const messages = (lang: string) => catalogs[lang]

function item(id: string, fields: Partial<Message> = {}): Message {
  return { ID: id, Title: id, Body: "", Link: "", ReadAt: null, CreatedAt: "2026-09-29T09:00:00Z", ...fields }
}

it("older backend: no Counts means no categories", () => {
  expect(inbox.parseCounts(undefined)).toBe(null)
  expect(inbox.parseCounts(null)).toBe(null)
  expect(inbox.parseCounts(3)).toBe(null)
  expect(inbox.resolveDefaultTab("personal", null)).toBe("all")
  expect(inbox.resolveDefaultTab("requestsIfOpen", null)).toBe("all")
})

it("counts are parsed tolerantly", () => {
  expect(inbox.parseCounts({ All: 4, Requests: 2, Personal: "x", Activity: -1 })).toEqual({ all: 4, requests: 2, personal: 0, activity: 0 })
  expect(inbox.parseCounts({})).toEqual({ all: 0, requests: 0, personal: 0, activity: 0 })
  expect(inbox.parseOtherEvents(5)).toBe(5)
  expect(inbox.parseOtherEvents(undefined)).toBe(0)
  expect(inbox.parseOtherEvents("5")).toBe(0)
})

it("default tab per app", () => {
  const none = { all: 0, requests: 0, personal: 0, activity: 0 }
  const open = { ...none, requests: 2 }
  expect(inbox.resolveDefaultTab("all", open)).toBe("all") // landing, event participant
  expect(inbox.resolveDefaultTab("personal", open)).toBe("personal") // id
  expect(inbox.resolveDefaultTab("requests", none)).toBe("requests") // event /manage
  expect(inbox.resolveDefaultTab("requestsIfOpen", open)).toBe("requests") // admin, exercises
  expect(inbox.resolveDefaultTab("requestsIfOpen", none)).toBe("all")
})

const request = (id: string, fields: Partial<Message> = {}) => item(id, { Category: "requests", ActionRequired: true, ...fields })

it("requests: open first, resolved below, order kept inside each group", () => {
  const list = [
    request("r1", { ResolvedAt: "2026-09-29T10:00:00Z" }),
    request("o1"),
    request("r2", { ResolvedAt: "2026-09-29T08:00:00Z" }),
    request("o2"),
  ]
  expect(inbox.orderForTab(list, "requests").map((entry) => entry.ID)).toEqual(["o1", "o2", "r1", "r2"])
  expect(inbox.orderForTab(list, "all").map((entry) => entry.ID)).toEqual(["r1", "o1", "r2", "o2"])
})

it("open = ActionRequired and not resolved (§8.3)", () => {
  expect(inbox.isOpenRequest(request("r", { ResolvedAt: "2026-09-29T10:00:00Z" }))).toBe(false)
  expect(inbox.isOpenRequest(request("o"))).toBe(true)
  expect(inbox.isOpenRequest(request("read", { ReadAt: "2026-09-29T10:00:00Z" }))).toBe(true)
  // Backfilled legacy rows keep ActionRequired false even in «Запити».
  expect(inbox.isOpenRequest(item("legacy", { Category: "requests" }))).toBe(false)
  expect(inbox.isUnread(item("u"))).toBe(true)
  expect(inbox.isUnread(item("x", { ReadAt: "2026-09-29T10:00:00Z" }))).toBe(false)
})

it("«Вирішено» only where the server says Resolvable on an open request", () => {
  expect(inbox.canResolve(request("alarm", { Type: "resources.alarm.raised", Resolvable: true }))).toBe(true)
  expect(inbox.canResolve(request("alarm", { Resolvable: true, ResolvedAt: "2026-09-29T10:00:00Z" }))).toBe(false)
  expect(inbox.canResolve(request("alarm", { Resolvable: false }))).toBe(false)
  // No flag, no button: the type alone decides nothing.
  expect(inbox.canResolve(request("lab", { Type: "event.lab.failed" }))).toBe(false)
  expect(inbox.canResolve(item("fyi", { Resolvable: true }))).toBe(false)
})



it("an open request needs action even when it was read; a resolved one does not", () => {
  expect(inbox.needsAction(request("o", { ReadAt: "2026-09-29T10:00:00Z" }))).toBe(true)
  expect(inbox.needsAction(request("o"))).toBe(true)
  expect(inbox.needsAction(request("r", { ReadAt: "2026-09-29T10:00:00Z", ResolvedAt: "2026-09-29T10:00:00Z" }))).toBe(false)
  expect(inbox.needsAction(item("fyi"))).toBe(false)
})

it("the bell label says what is counted: open requests, unread items or both", () => {
  expect(inbox.bellLabel(0, null)).toEqual({ key: "inbox.title", vars: {} })
  expect(inbox.bellLabel(3, null)).toEqual({ key: "inbox.titleUnread", vars: { count: 3 } })
  expect(inbox.bellLabel(0, { all: 0, requests: 0, personal: 0, activity: 0 }).key).toBe("inbox.title")
  // The owner's case: one open (already read) request and nothing unread.
  expect(inbox.bellLabel(0, { all: 1, requests: 1, personal: 0, activity: 0 })).toEqual({ key: "inbox.titleRequests", vars: { count: 1 } })
  expect(inbox.bellLabel(2, { all: 2, requests: 0, personal: 1, activity: 1 })).toEqual({ key: "inbox.titleUnread", vars: { count: 2 } })
  expect(inbox.bellLabel(3, { all: 3, requests: 1, personal: 1, activity: 1 })).toEqual({ key: "inbox.titleBoth", vars: { requests: 1, unread: 2 } })
})

it("the new inbox keys exist in both catalogs", () => {
  for (const lang of ["uk", "en"]) {
    const catalog = messages(lang)
    for (const key of ["inbox.unreadItem", "inbox.needsAction", "inbox.titleRequests", "inbox.titleBoth", "inbox.tabCountRequests"]) {
      expect(catalog[key], `${lang}: ${key}`).toBeTruthy()
    }
  }
})
it("a card link is opened only when it is a site path, an anchor, http(s) or mailto", () => {
  expect(inbox.safeHref("/manage/")).toBe("/manage/")
  expect(inbox.safeHref("https://spring.example.org/manage/")).toBe("https://spring.example.org/manage/")
  expect(inbox.safeHref(" #top ")).toBe("#top")
  expect(inbox.safeHref("mailto:a@b.c")).toBe("mailto:a@b.c")
  expect(inbox.safeHref("//evil.example")).toBe(null)
  expect(inbox.safeHref("javascript:alert(1)")).toBe(null)
  expect(inbox.safeHref("")).toBe(null)
})


it("bell and resolver name", () => {
  expect(inbox.bellCount(3, null)).toBe(3)
  expect(inbox.bellCount(3, { all: 5, requests: 2, personal: 3, activity: 0 })).toBe(5)
  expect(inbox.resolverName(item("a", { ResolvedBy: { ID: "u", Name: " Іван П. " } }))).toBe("Іван П.")
  expect(inbox.resolverName(item("c", { ResolvedBy: null }))).toBe("")
})

it("tab membership", () => {
  expect(inbox.inTab(item("x"), "all")).toBe(true)
  expect(inbox.inTab(item("x"), "personal")).toBe(false)
  expect(inbox.inTab(item("x", { Category: "activity" }), "activity")).toBe(true)
})

it("optimistic counts", () => {
  const counts = { all: 5, requests: 2, personal: 3, activity: 2 }
  expect(inbox.countsAfterRead(counts, item("p", { Category: "personal" }))).toEqual({ all: 4, requests: 2, personal: 2, activity: 2 })
  // An open request stays in All and Requests until it is resolved.
  expect(inbox.countsAfterRead(counts, request("q"))).toEqual(counts)
  expect(inbox.countsAfterResolve(counts, request("q"))).toEqual({ all: 4, requests: 1, personal: 3, activity: 2 })
  expect(inbox.countsAfterResolve(counts, item("p", { Category: "personal" }))).toEqual(counts)
  expect(inbox.countsAfterRead(counts, item("x", { ReadAt: "2026-09-29T10:00:00Z", Category: "personal" }))).toEqual(counts)
  expect(inbox.countsAfterReadAll(counts, "personal")).toEqual({ all: 2, requests: 2, personal: 0, activity: 2 })
  expect(inbox.countsAfterReadAll(counts, "all")).toEqual({ all: 2, requests: 2, personal: 0, activity: 0 })
  expect(inbox.countsAfterReadAll(counts, "requests")).toEqual(counts)
})

it("queries carry the category and the event scope", () => {
  expect(inbox.inboxQuery("all")).toBe("")
  expect(inbox.inboxQuery("requests")).toBe("?category=requests")
  expect(inbox.inboxQuery("personal", "ev1")).toBe("?category=personal&event=ev1")
  expect(inbox.inboxQuery("all", undefined, { since: "a" })).toBe("?since=a")
})

it("resolved line keys exist in both catalogs", () => {
  expect(inbox.resolutionKey("approved", true)).toBe("inbox.resolved.approved")
  expect(inbox.resolutionKey("fixed", false)).toBe("inbox.resolved.fixed.system")
  expect(inbox.resolutionKey("expired", true)).toBe("inbox.resolved.expired.system")
  expect(inbox.resolutionKey("withdrawn", false)).toBe("inbox.resolved.withdrawn.system")
  expect(inbox.resolutionKey("something-new", true)).toBe("inbox.resolved.other")
  expect(inbox.resolutionKey(null, false)).toBe("inbox.resolved.other.system")
  for (const lang of ["uk", "en"]) {
    const catalog = messages(lang)
    for (const resolution of [...inbox.INBOX_RESOLUTIONS, "other"]) {
      for (const named of [true, false]) {
        const key = inbox.resolutionKey(resolution, named)
        expect(catalog[key], `${lang}: ${key}`).toBeTruthy()
        expect(catalog[key].includes("{time}"), `${lang}: ${key} has {time}`).toBeTruthy()
        if (named && !key.endsWith(".system")) expect(catalog[key].includes("{name}"), `${lang}: ${key} has {name}`).toBeTruthy()
      }
    }
    for (const tab of inbox.INBOX_TABS) expect(catalog[`inbox.tab.${tab}`], `${lang}: inbox.tab.${tab}`).toBeTruthy()
  }
})

it("row time: HH:MM today, date with time otherwise", () => {
  const now = new Date(2026, 8, 29, 18, 0)
  expect(inbox.formatInboxTime(new Date(2026, 8, 29, 12, 4).toISOString(), now, "en-GB")).toBe("12:04")
  expect(inbox.formatInboxTime(new Date(2026, 8, 27, 9, 30).toISOString(), now, "en-GB")).toMatch(/27 Sept?, 09:30/)
  expect(inbox.formatInboxTime("not a date", now)).toBe("")
})
