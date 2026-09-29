// Inbox categories (docs/INBOX-DESIGN.md §2–3): pure logic shared by InboxButton and its tests.
// No React or app imports here, so node --test runs it directly.

export type InboxCategory = "requests" | "personal" | "activity"
export type InboxTab = "all" | InboxCategory
export const INBOX_TABS: readonly InboxTab[] = ["all", "requests", "personal", "activity"]

/** Default tab per app: a fixed tab, or «Запити» when open requests exist, else «Усі» (admin, exercises). */
export type InboxDefaultTab = InboxTab | "requestsIfOpen"

/** Tab counts: requests = open requests; the others = unread. */
export type InboxCounts = Record<InboxTab, number>

// expired (the event ended undecided) and withdrawn (the applicant left) are system closures: no resolver name.
export type InboxResolution = "approved" | "rejected" | "fixed" | "resolved" | "expired" | "withdrawn"
export const INBOX_RESOLUTIONS: readonly InboxResolution[] = ["approved", "rejected", "fixed", "resolved", "expired", "withdrawn"]
const SYSTEM_RESOLUTIONS: readonly string[] = ["expired", "withdrawn"]

/** The only request type a person may close by hand (§8.1): «Лабораторія впала». */
export const MANUALLY_RESOLVABLE_TYPE = "event.lab.failed"

export type InboxMessage = {
  ID: string
  Title: string
  Body: string
  Link: string
  Icon?: string
  Tone?: string
  AccentColor?: string
  AutoDismissMs?: number | null
  Actions?: { label: string; href: string }[] | null
  ReadAt: string | null
  CreatedAt: string
  // Set when the notification belongs to an Event; labelled with its name.
  EventID?: string | null
  EventName?: string | null
  EventTag?: string | null
  // Categories (docs/INBOX-DESIGN.md §8.3; absent on older backends).
  Type?: string
  Category?: InboxCategory
  ActionRequired?: boolean
  ResolvedAt?: string | null
  Resolution?: InboxResolution | null
  // null when the system closed the request.
  ResolvedBy?: { ID: string; Name: string } | null
}

/** Categories are on when the poll carries a Counts object (older backends omit it). */
export function parseCounts(value: unknown): InboxCounts | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const num = (key: string) => {
    const n = raw[key]
    return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  }
  return { all: num("All"), requests: num("Requests"), personal: num("Personal"), activity: num("Activity") }
}

export function parseOtherEvents(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

export function isCategory(value: unknown): value is InboxCategory {
  return value === "requests" || value === "personal" || value === "activity"
}

/** An open request waits for a decision (§8.3: ActionRequired and not resolved); it counts in «Запити» even when read. */
export function isOpenRequest(item: InboxMessage): boolean {
  return !!item.ActionRequired && !item.ResolvedAt
}

/** The server marks resolved copies read, so ReadAt alone decides. */
export function isUnread(item: InboxMessage): boolean {
  return !item.ReadAt
}

/** «Вирішено» is offered only on open «Лабораторія впала» requests; the rest close by decision. */
export function canResolve(item: InboxMessage): boolean {
  return isOpenRequest(item) && item.Type === MANUALLY_RESOLVABLE_TYPE
}

export function resolveDefaultTab(defaultTab: InboxDefaultTab, counts: InboxCounts | null): InboxTab {
  if (!counts) return "all"
  if (defaultTab === "requestsIfOpen") return counts.requests > 0 ? "requests" : "all"
  return defaultTab
}

/** Whether an item belongs in the list of a tab. */
export function inTab(item: InboxMessage, tab: InboxTab): boolean {
  return tab === "all" || item.Category === tab
}

/** «Запити»: open requests first, the rest below; each group keeps the server's newest-first order. */
export function orderForTab(items: InboxMessage[], tab: InboxTab): InboxMessage[] {
  if (tab !== "requests") return items
  return [...items.filter(isOpenRequest), ...items.filter((item) => !isOpenRequest(item))]
}

/** Who resolved a request; empty for system resolutions. */
export function resolverName(item: InboxMessage): string {
  return item.ResolvedBy?.Name?.trim() ?? ""
}

/** The bell: unread plus open requests (Counts.All); older backends send only UnreadCount. */
export function bellCount(unread: number, counts: InboxCounts | null): number {
  return counts ? counts.all : unread
}

/** Optimistic counts after one item is read locally (the next poll corrects them).
 *  Counts.All = open requests + unread personal + unread activity. */
export function countsAfterRead(counts: InboxCounts, item: InboxMessage): InboxCounts {
  if (!isUnread(item) || isOpenRequest(item)) return counts
  const next = { ...counts, all: Math.max(0, counts.all - 1) }
  if (item.Category === "personal" || item.Category === "activity") next[item.Category] = Math.max(0, next[item.Category] - 1)
  return next
}

/** Optimistic counts after «Вирішено»: the request leaves «Запити» and the bell. */
export function countsAfterResolve(counts: InboxCounts, item: InboxMessage): InboxCounts {
  if (!isOpenRequest(item)) return counts
  return { ...counts, all: Math.max(0, counts.all - 1), requests: Math.max(0, counts.requests - 1) }
}

/** Optimistic counts after «Позначити прочитаним» on a tab; open requests stay open. */
export function countsAfterReadAll(counts: InboxCounts, tab: InboxTab): InboxCounts {
  if (tab === "all") return { ...counts, all: counts.requests, personal: 0, activity: 0 }
  if (tab === "requests") return counts
  return { ...counts, all: Math.max(0, counts.all - counts[tab]), [tab]: 0 }
}

/** i18n key for the resolved line: with the resolver's name, or the label alone (system closures, no name). */
export function resolutionKey(resolution: string | null | undefined, hasName: boolean): string {
  const known = INBOX_RESOLUTIONS.includes(resolution as InboxResolution) ? resolution! : "other"
  return `inbox.resolved.${known}${hasName && !SYSTEM_RESOLUTIONS.includes(known) ? "" : ".system"}`
}

/** API query for a tab (and the event scope on event sites). */
export function inboxQuery(tab: InboxTab, eventId?: string, extra: Record<string, string> = {}): string {
  const query = new URLSearchParams(extra)
  if (tab !== "all") query.set("category", tab)
  if (eventId) query.set("event", eventId)
  const text = query.toString()
  return text ? `?${text}` : ""
}

/** Row time: HH:MM today, otherwise a short date with time. */
export function formatInboxTime(value: string, now = new Date(), locale = "uk-UA"): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const time = date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
  if (date.toDateString() === now.toDateString()) return time
  const day = date.toLocaleDateString(locale, { day: "numeric", month: "short", ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) })
  return `${day}, ${time}`
}
