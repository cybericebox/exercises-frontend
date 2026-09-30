"use client"

/* eslint-disable @eslint-react/dom-no-dangerously-set-innerhtml -- Notification HTML is sanitized with DOMPurify at each insertion point. */

// Categorized inbox (docs/INBOX-DESIGN.md §3). The reference implementation: copied one-to-one
// to id, admin, exercises and event; each app only sets the props below.

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import * as Popover from "@radix-ui/react-popover"
import DOMPurify from "isomorphic-dompurify"
import { Bell, Check, ChevronRight, X } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadError } from "@/components/ui/load-error"

import { apiGet, apiPatch, apiPost } from "@/api/client"
import { useRole } from "@/lib/useRole"
import { onServiceRestored } from "@/lib/serviceStatus"
import { localizedError } from "@/i18n/apiError"
import { t } from "@/i18n/t"
import { NotificationMessageCard } from "@/components/notifications/NotificationMessageCard"
import { NotificationPopIn } from "@/components/notifications/NotificationPopIn"
import { popInDuration } from "@/components/notifications/popInDuration"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import {
  INBOX_TABS, canResolve, countsAfterRead, countsAfterReadAll, countsAfterResolve, formatInboxTime, inTab, inboxQuery, isUnread, orderForTab,
  bellCount, parseCounts, parseOtherEvents, resolutionKey, resolveDefaultTab, resolverName,
  type InboxCounts, type InboxDefaultTab, type InboxMessage as Message, type InboxTab,
} from "@/components/notifications/inboxModel"
import { keepBrand } from "@/i18n/brand"

// Dropdown height cap, the same in every app: tune it here.
const panelMaxHeight = "max-h-[min(28rem,calc(100vh-6rem))]"

type InboxCursor = { ID: string; CreatedAt: string }
type InboxPoll = { Cursor: InboxCursor | null; NewInbox: Message[]; UnreadCount: number; Counts?: unknown; OtherEventsCount?: unknown }
type InboxPage = { Items: Message[]; NextCursor: InboxCursor | null }
const READ_SYNC_KEY = "cybericebox:inbox-read"
// A link here with ?inbox opens the dropdown on arrival (the event site's «Ще N в інших заходах»).
const OPEN_PARAM = "inbox"

export type InboxButtonProps = {
  /** Tab shown on every open: landing "all", id "personal", admin/exercises "requestsIfOpen", event "all" (/manage: "requests"). */
  defaultTab?: InboxDefaultTab
  /** Event-site mode: the list is scoped to this event, event labels are hidden, and other events' unread show as a footer link. */
  event?: { id: string; otherEventsHref: string }
}

function EventLabel({ name }: { name?: string | null }) {
  if (!name) return null
  return <span className="max-w-[60%] shrink-0 truncate rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{name}</span>
}

function safeHref(value: string): string | null {
  const href = value.trim()
  if (href.startsWith("/") && !href.startsWith("//")) return href
  if (href.startsWith("#") || /^https?:\/\/|^mailto:/i.test(href)) return href
  return null
}

function resolvedLine(item: Message): string {
  const name = resolverName(item)
  return t(resolutionKey(item.Resolution, name !== ""), { name, time: formatInboxTime(item.ResolvedAt ?? "") })
}

export function InboxButton({ defaultTab = "all", event }: InboxButtonProps = {}) {
  const allowed = useRole().can("notifications.self")
  const router = useRouter()
  const eventId = event?.id
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<InboxTab>("all")
  const [items, setItems] = useState<Message[]>([])
  const [popIns, setPopIns] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [olderCursor, setOlderCursor] = useState<InboxCursor | null>(null)
  const [unread, setUnread] = useState(0)
  // null = the backend has no categories yet: the dropdown shows only «Усі».
  const [counts, setCounts] = useState<InboxCounts | null>(null)
  const [otherEvents, setOtherEvents] = useState(0)
  const [error, setError] = useState("")
  // A failed data load (list / poll): shown as the shared LoadError in the list area, never as a bar. `error` above is for actions only.
  const [loadFailure, setLoadFailure] = useState<{ error: unknown } | null>(null)
  const [resolving, setResolving] = useState<ReadonlySet<string>>(() => new Set())
  const cursorRef = useRef<InboxCursor | null>(null)
  const unreadCountRef = useRef(0)
  const countsRef = useRef<InboxCounts | null>(null)
  const tabRef = useRef<InboxTab>("all")
  const olderCursorRef = useRef<InboxCursor | null>(null)
  const loadingOlderRef = useRef(false)
  const listRevisionRef = useRef(0)
  const openRef = useRef(false)
  const pollNowRef = useRef<() => void>(() => {})
  const scrollAreaRef = useRef<HTMLDivElement | null>(null)
  const lastItemRef = useRef<HTMLLIElement | null>(null)
  const lastItemID = items[items.length - 1]?.ID

  const applyCounts = useCallback((next: InboxCounts | null) => {
    countsRef.current = next
    setCounts(next)
  }, [])

  const loadOlder = useCallback(async () => {
    const before = olderCursorRef.current
    if (!before || loadingOlderRef.current) return
    const revision = listRevisionRef.current
    const current = tabRef.current
    loadingOlderRef.current = true
    setLoadingOlder(true)
    try {
      const query = inboxQuery(current, eventId, { before_id: before.ID, before_at: before.CreatedAt })
      const page = await apiGet<InboxPage>(`/api/notifications/inbox${query}`)
      if (revision !== listRevisionRef.current) return
      olderCursorRef.current = page.NextCursor
      setOlderCursor(page.NextCursor)
      setItems((previous) => {
        const known = new Set(previous.map((item) => item.ID))
        return orderForTab([...previous, ...(page.Items ?? []).filter((item) => !known.has(item.ID))], current)
      })
      setLoadFailure(null)
    } catch (err) { setLoadFailure({ error: err }) }
    finally { loadingOlderRef.current = false; setLoadingOlder(false) }
  }, [eventId])

  useEffect(() => {
    const area = scrollAreaRef.current
    const last = lastItemRef.current
    if (!open || !olderCursor || loading || !area || !last || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void loadOlder()
    }, { root: area })
    observer.observe(last)
    return () => observer.disconnect()
  }, [open, olderCursor, lastItemID, loading, loadOlder])

  const refresh = useCallback((): Promise<Message[] | null> => {
    const revision = ++listRevisionRef.current
    const current = tabRef.current
    return apiGet<InboxPage>(`/api/notifications/inbox${inboxQuery(current, eventId)}`)
      .then((page) => {
        if (revision !== listRevisionRef.current) return null
        const list = page?.Items ?? []
        olderCursorRef.current = page?.NextCursor ?? null
        setOlderCursor(page?.NextCursor ?? null)
        // An older refresh must not undo a successful read action.
        setItems((previous) => orderForTab(list.map((item) => ({
          ...item,
          ReadAt: item.ReadAt ?? previous.find((entry) => entry.ID === item.ID)?.ReadAt ?? null,
        })), current))
        const readById = new Map(list.map((item) => [item.ID, !isUnread(item)]))
        setPopIns((previous) => previous.filter((item) => !readById.get(item.ID)))
        setLoadFailure(null)
        return list
      })
      .catch((err) => { setLoadFailure({ error: err }); return null })
      .finally(() => { if (revision === listRevisionRef.current) setLoading(false) })
  }, [eventId])

  useEffect(() => {
    if (!allowed) return
    let active = true
    let initialized = false
    let polling = false
    let pending = false
    const scope = eventId ? { event: eventId } : undefined
    const poll = async () => {
      if (!active) return
      if (polling) { pending = true; return }
      polling = true
      try {
        if (!initialized) {
          const baseline = await apiGet<InboxPoll>(`/api/notifications/inbox/poll${inboxQuery("all", undefined, scope)}`)
          if (!active) return
          cursorRef.current = baseline.Cursor ?? { ID: "00000000-0000-0000-0000-000000000000", CreatedAt: "1970-01-01T00:00:00Z" }
          unreadCountRef.current = baseline.UnreadCount
          setUnread(baseline.UnreadCount)
          applyCounts(parseCounts(baseline.Counts))
          setOtherEvents(parseOtherEvents(baseline.OtherEventsCount))
          initialized = true
          await refresh()
          return
        }
        const since = cursorRef.current!
        const query = inboxQuery("all", undefined, { ...scope, since_id: since.ID, since_at: since.CreatedAt })
        const result = await apiGet<InboxPoll>(`/api/notifications/inbox/poll${query}`)
        if (!active) return
        cursorRef.current = result.Cursor ?? since
        const fresh = (result.NewInbox ?? []).filter(isUnread)
        if (openRef.current && result.NewInbox?.length) {
          const current = tabRef.current
          setItems((previous) => {
            const known = new Set(previous.map((item) => item.ID))
            const added = result.NewInbox.filter((item) => !known.has(item.ID) && inTab(item, current)).reverse()
            return added.length ? orderForTab([...added, ...previous], current) : previous
          })
        }
        let poppable = fresh.filter((item) => popInDuration(item.AutoDismissMs) > 0)
        if (result.UnreadCount !== unreadCountRef.current + fresh.length) {
          const latest = await refresh()
          poppable = latest ? poppable.filter((item) => latest.some((entry) => entry.ID === item.ID && isUnread(entry))) : []
        } else {
          setLoadFailure(null)
        }
        unreadCountRef.current = result.UnreadCount
        setUnread(result.UnreadCount)
        // Older backends send Counts only on some polls: keep the last known ones.
        const nextCounts = parseCounts(result.Counts)
        if (nextCounts) applyCounts(nextCounts)
        if (result.OtherEventsCount !== undefined) setOtherEvents(parseOtherEvents(result.OtherEventsCount))
        if (active && poppable.length) setPopIns((previous) => [...previous, ...poppable.filter((item) => !previous.some((entry) => entry.ID === item.ID))])
      } catch (err) {
        if (active) { setLoadFailure({ error: err }); setLoading(false) }
      } finally {
        polling = false
        if (pending && active) { pending = false; queueMicrotask(() => { void poll() }) }
      }
    }
    const pollWhenVisible = () => { if (document.visibilityState !== "hidden") void poll() }
    pollNowRef.current = () => { void poll() }
    void poll()
    const unsubscribe = onServiceRestored(pollWhenVisible)
    const timer = window.setInterval(pollWhenVisible, 8_000)
    document.addEventListener("visibilitychange", pollWhenVisible)
    window.addEventListener("focus", pollWhenVisible)
    window.addEventListener("cybericebox:inbox-updated", pollWhenVisible)
    const onStorage = (event: StorageEvent) => { if (event.key === READ_SYNC_KEY) { void pollWhenVisible(); if (openRef.current) void refresh() } }
    window.addEventListener("storage", onStorage)
    return () => {
      active = false
      pollNowRef.current = () => {}
      unsubscribe()
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", pollWhenVisible)
      window.removeEventListener("focus", pollWhenVisible)
      window.removeEventListener("cybericebox:inbox-updated", pollWhenVisible)
      window.removeEventListener("storage", onStorage)
    }
  }, [allowed, refresh, applyCounts, eventId])

  const selectTab = useCallback((next: InboxTab) => {
    tabRef.current = next
    setTab(next)
    setItems([])
    setOlderCursor(null)
    olderCursorRef.current = null
    setLoading(true)
    if (scrollAreaRef.current) scrollAreaRef.current.scrollTop = 0
    void refresh()
  }, [refresh])

  const openInbox = useCallback((next: boolean) => {
    openRef.current = next
    setOpen(next)
    // The chosen tab lives while the dropdown is open; every open starts on the app's default.
    if (!next) return
    const initial = resolveDefaultTab(defaultTab, countsRef.current)
    if (initial === tabRef.current) void refresh()
    else selectTab(initial)
  }, [defaultTab, selectTab, refresh])

  useEffect(() => {
    if (!allowed) return
    const url = new URL(window.location.href)
    if (!url.searchParams.has(OPEN_PARAM)) return
    // Opens after the first paint, so the dropdown anchors to the mounted trigger.
    const timer = window.setTimeout(() => {
      url.searchParams.delete(OPEN_PARAM)
      window.history.replaceState(window.history.state, "", url)
      openInbox(true)
    })
    return () => window.clearTimeout(timer)
  }, [allowed, openInbox])

  if (!allowed) return null

  const badge = bellCount(unread, counts)
  const label = badge ? t("inbox.titleUnread", { count: badge }) : t("inbox.title")
  const tabs = counts ? INBOX_TABS : []
  const tabHasUnread = items.some(isUnread) || (tab === "all" ? unread > 0 : tab !== "requests" && (counts?.[tab] ?? 0) > 0)

  function announceRead() {
    try {
      const previous = window.localStorage.getItem(READ_SYNC_KEY)
      window.localStorage.setItem(READ_SYNC_KEY, previous === "1" ? "0" : "1")
    } catch { /* Polling still synchronizes read state. */ }
  }

  async function markRead(item: Message): Promise<boolean> {
    if (!isUnread(item)) return true
    try {
      await apiPatch(`/api/notifications/inbox/${encodeURIComponent(item.ID)}/read`, {})
      unreadCountRef.current = Math.max(0, unreadCountRef.current - 1)
      setUnread(unreadCountRef.current)
      if (countsRef.current) applyCounts(countsAfterRead(countsRef.current, item))
      setItems((current) => current.map((entry) => entry.ID === item.ID ? { ...entry, ReadAt: new Date().toISOString() } : entry))
      setPopIns((current) => current.filter((entry) => entry.ID !== item.ID))
      announceRead()
      return true
    } catch {
      setError(t("inbox.markReadError"))
      return false
    }
  }

  async function followLink(item: Message, href: string) {
    if (!(await markRead(item))) return
    openInbox(false)
    if (href.startsWith("/") && !href.startsWith("//")) router.push(href)
    else window.location.assign(href)
  }

  // «Вирішено» closes a «Лабораторія впала» request for every recipient (§8.2).
  async function resolve(item: Message) {
    if (resolving.has(item.ID)) return
    setError("")
    setResolving((current) => new Set(current).add(item.ID))
    let failure = ""
    try {
      await apiPost(`/api/notifications/inbox/${encodeURIComponent(item.ID)}/resolve`, {})
      if (countsRef.current) applyCounts(countsAfterResolve(countsRef.current, item))
      if (isUnread(item)) {
        unreadCountRef.current = Math.max(0, unreadCountRef.current - 1)
        setUnread(unreadCountRef.current)
      }
      announceRead()
    } catch (err) {
      // 30217 not found, 20218 not resolvable by hand, 70219 already resolved: show why, then the current state.
      failure = localizedError(err)
    }
    setResolving((current) => { const next = new Set(current); next.delete(item.ID); return next })
    await refresh()
    if (failure) setError(failure)
    else pollNowRef.current()
  }

  // «Позначити прочитаним» acts on the current tab only.
  async function readAll() {
    setError("")
    const current = tab
    try {
      await apiPatch(`/api/notifications/inbox/read-all${inboxQuery(current, eventId)}`, {})
      const now = new Date().toISOString()
      if (current === "all") {
        unreadCountRef.current = 0
        setUnread(0)
        setPopIns([])
      }
      if (countsRef.current) applyCounts(countsAfterReadAll(countsRef.current, current))
      setItems((list) => list.map((item) => inTab(item, current) ? { ...item, ReadAt: item.ReadAt ?? now } : item))
      announceRead()
      // Category totals come from the server; the poll corrects the bell right away.
      if (current !== "all") pollNowRef.current()
    } catch {
      setError(t("inbox.readAllError"))
    }
  }

  const emptyMessage = tab === "requests" ? t("inbox.emptyRequests") : t("inbox.empty")

  return <><Popover.Root open={open} onOpenChange={openInbox}>
    <Popover.Trigger asChild>
      <button type="button" aria-label={label} className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary">
        <Bell className="h-4 w-4" />
        {badge > 0 && <span className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-primary px-0.5 text-[10px] font-semibold leading-none text-primary-foreground">{badge > 99 ? "99+" : badge}</span>}
      </button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content align="end" sideOffset={20} collisionPadding={12} aria-label={t("inbox.panel")} className={`z-50 flex ${panelMaxHeight} w-[min(32rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground outline-none`}>
        <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-3 pb-2">
          <h2 className="flex text-muted-foreground"><span className="sr-only">{t("inbox.title")}</span><Bell aria-hidden="true" className="h-[19px] w-[19px]" /></h2>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" disabled={!tabHasUnread} onClick={() => void readAll()} className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent">{t("inbox.readAll")}</button>
            <Popover.Close aria-label={t("inbox.close")} className="flex rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"><X className="h-4 w-4" /></Popover.Close>
          </div>
        </div>
        {/* The segmented control of the catalog's «Область» switch (exercises-frontend). */}
        {tabs.length > 0 && <div className="shrink-0 border-b border-border px-3 pb-3">
          <div role="tablist" aria-label={t("inbox.tabs")} className="flex h-10 w-full items-center rounded-md bg-muted p-1">
            {tabs.map((value) => {
              const count = counts?.[value] ?? 0
              const selected = tab === value
              return <button key={value} type="button" role="tab" id={`inbox-tab-${value}`} aria-controls="inbox-tabpanel" aria-selected={selected}
                aria-label={count > 0 ? t("inbox.tabCount", { name: t(`inbox.tab.${value}`), count }) : undefined}
                onClick={() => { if (!selected) selectTab(value) }}
                className={`inline-flex h-8 min-w-0 flex-auto items-center justify-center gap-1 rounded px-2 text-sm focus-visible:outline-2 focus-visible:outline-primary ${selected ? "bg-card font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <span className="truncate">{t(`inbox.tab.${value}`)}</span>
                {count > 0 && <span aria-hidden="true" className="text-xs tabular-nums text-muted-foreground">{count > 99 ? "99+" : count}</span>}
              </button>
            })}
          </div>
        </div>}
        {tabs.length === 0 && <div className="shrink-0 border-b border-border" />}
        {error && <p role="alert" className="mx-3 mt-3 rounded-md bg-[var(--ib-danger-bg)] p-2 text-xs text-[var(--ib-danger)]">{error}</p>}
        <div ref={scrollAreaRef} id="inbox-tabpanel" role={tabs.length ? "tabpanel" : undefined} aria-labelledby={tabs.length ? `inbox-tab-${tab}` : undefined} className="flex min-h-0 flex-col overflow-y-auto">
          {/* loading and empty share one centered box of the same height, so nothing jumps */}
          {loading || loadFailure || items.length === 0 ? <div className="flex min-h-48 flex-1 items-center justify-center">{loading ? <Spinner size="lg" label={t("inbox.loadingMessages")} /> : loadFailure ? <LoadError message={t("inbox.loadError")} error={loadFailure.error} compact onRetry={() => { setLoading(true); void refresh() }} /> : <EmptyState message={emptyMessage} />}</div> : <ul className="divide-y divide-border">{items.map((item, index) => {
            const href = safeHref(item.Link ?? "")
            const resolved = !!item.ResolvedAt
            const unreadItem = isUnread(item)
            return <li key={item.ID} ref={index === items.length - 1 ? lastItemRef : undefined} className={`px-4 py-3 hover:bg-accent/50 ${resolved ? "opacity-60" : ""}`}>
              <NotificationMessageCard
                icon={item.Icon} tone={item.Tone} accentColor={item.AccentColor} title={item.Title}
                body={item.Body ? <span dangerouslySetInnerHTML={{ __html: keepBrand(DOMPurify.sanitize(item.Body, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })) }} /> : undefined}
                unread={unreadItem} compact
                timestamp={<span className="flex min-w-0 items-center justify-between gap-2">
                  {resolved
                    ? <HoverTooltip text={formatInboxTime(item.CreatedAt)} className="min-w-0"><span className="min-w-0 truncate">{resolvedLine(item)}{" "}<span className="sr-only">{formatInboxTime(item.CreatedAt)}</span></span></HoverTooltip>
                    : <time dateTime={item.CreatedAt} className="min-w-0 truncate">{formatInboxTime(item.CreatedAt)}</time>}
                  {!event && <EventLabel name={item.EventName} />}
                </span>}
                actions={href || unreadItem || canResolve(item) ? <>
                  {href ? <a href={href} onClick={(clickEvent) => { clickEvent.preventDefault(); void followLink(item, href) }} className="text-sm font-medium text-primary underline-offset-2 hover:underline">{t("inbox.open")}</a> : unreadItem ? <button type="button" onClick={() => void markRead(item)} className="text-xs font-medium text-primary hover:underline">{t("inbox.markRead")}</button> : null}
                  {canResolve(item) && <button type="button" disabled={resolving.has(item.ID)} aria-busy={resolving.has(item.ID)} onClick={() => void resolve(item)} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-60">
                    {resolving.has(item.ID) ? <Spinner size="sm" className="[&_.crest-loader]:text-base" /> : <Check aria-hidden="true" className="h-4 w-4" />}{t("inbox.resolve")}
                  </button>}
                </> : undefined}
              />
            </li>
          })}</ul>}
          {loadingOlder && <div className="flex justify-center px-4 py-3"><Spinner size="sm" label={t("admin.loading")} /></div>}
        </div>
        {event && otherEvents > 0 && <a href={event.otherEventsHref} className="flex shrink-0 items-center justify-center gap-1 border-t border-border px-4 py-2.5 text-sm font-medium text-primary hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary">
          {t("inbox.otherEvents", { count: otherEvents })}<ChevronRight aria-hidden="true" className="h-4 w-4" />
        </a>}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
  {popIns.length > 0 && createPortal(<div className="fixed right-4 top-16 z-[70] flex max-h-[calc(100vh-5rem)] flex-col gap-3 overflow-y-auto" aria-live="polite">
    {popIns.slice(0, 3).map((item) => <NotificationPopIn key={item.ID} message={item} onClose={() => setPopIns((current) => current.filter((entry) => entry.ID !== item.ID))} onAction={(href) => { const safe = safeHref(href); if (safe) void followLink(item, safe) }} />)}
  </div>, document.body)}
  </>
}
