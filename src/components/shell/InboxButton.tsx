"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import * as Popover from "@radix-ui/react-popover"
import DOMPurify from "isomorphic-dompurify"
import { Bell, X } from "lucide-react"
import { apiGet, apiPatch } from "@/api/client"
import { useRole } from "@/lib/useRole"
import { LoadingArea, Spinner } from "@/components/ui/spinner"
import { EmptyState } from "@/components/ui/empty-state"
import { onServiceRestored } from "@/lib/serviceStatus"
import { NotificationMessageCard } from "@/components/notifications/NotificationMessageCard"
import { NotificationPopIn } from "@/components/notifications/NotificationPopIn"
import { popInDuration } from "@/components/notifications/popInDuration"
import { t } from "@/i18n/t"

// Dropdown height cap, the same in every app: tune it here.
const panelMaxHeight = "max-h-[min(28rem,calc(100vh-6rem))]"

type Message = {
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
}

type InboxCursor = { ID: string; CreatedAt: string }
type InboxPoll = { Cursor: InboxCursor | null; NewInbox: Message[]; UnreadCount: number }
type InboxPage = { Items: Message[]; NextCursor: InboxCursor | null }

const READ_SYNC_KEY = "cybericebox:inbox-read"

function EventLabel({ name }: { name?: string | null }) {
  if (!name) return null
  return <span className="max-w-[60%] truncate rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{name}</span>
}

function safeHref(value: string): string | null {
  const href = value.trim()
  if (href.startsWith("/") && !href.startsWith("//")) return href
  if (href.startsWith("#") || /^https?:\/\/|^mailto:/i.test(href)) return href
  return null
}

function rowLink(item: Message): { href: string; label: string } | null {
  const href = safeHref(item.Link ?? "")
  return href ? { href, label: t("inbox.open") } : null
}

export function InboxButton() {
  const allowed = useRole().can("notifications.self")
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Message[]>([])
  const [popIns, setPopIns] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [olderCursor, setOlderCursor] = useState<InboxCursor | null>(null)
  const [unread, setUnread] = useState(0)
  const [error, setError] = useState("")
  const cursor = useRef<InboxCursor | null>(null)
  const unreadCount = useRef(0)
  const olderCursorRef = useRef<InboxCursor | null>(null)
  const loadingOlderRef = useRef(false)
  const listRevision = useRef(0)
  const openRef = useRef(false)
  const scrollAreaRef = useRef<HTMLDivElement | null>(null)
  const lastItemRef = useRef<HTMLLIElement | null>(null)
  const refreshListRef = useRef<(() => Promise<Message[] | null>) | null>(null)
  const lastItemID = items[items.length - 1]?.ID

  const loadOlder = useCallback(async () => {
    const before = olderCursorRef.current
    if (!before || loadingOlderRef.current) return
    const revision = listRevision.current
    loadingOlderRef.current = true
    setLoadingOlder(true)
    try {
      const query = new URLSearchParams({ before_id: before.ID, before_at: before.CreatedAt })
      const page = await apiGet<InboxPage>(`/api/notifications/inbox?${query}`)
      if (revision !== listRevision.current) return
      olderCursorRef.current = page.NextCursor
      setOlderCursor(page.NextCursor)
      setItems((previous) => {
        const known = new Set(previous.map((item) => item.ID))
        return [...previous, ...page.Items.filter((item) => !known.has(item.ID))]
      })
      setError("")
    } catch { setError(t("inbox.loadError")) }
    finally { loadingOlderRef.current = false; setLoadingOlder(false) }
  }, [])

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

  const closePopIn = useCallback((id: string) => {
    setPopIns((current) => current.filter((item) => item.ID !== id))
  }, [])

  useEffect(() => {
    if (!allowed) return
    let current = true
    let initialized = false
    let polling = false
    let pending = false
    const refreshList = (): Promise<Message[] | null> => {
      const revision = ++listRevision.current
      return apiGet<InboxPage>("/api/notifications/inbox")
        .then((page) => {
          if (!current || revision !== listRevision.current) return null
          const next = page.Items ?? []
          olderCursorRef.current = page.NextCursor
          setOlderCursor(page.NextCursor)
          // A refresh started before a read request must not restore an old unread badge.
          setItems((previous) => next.map((item) => ({
            ...item,
            ReadAt: item.ReadAt ?? previous.find((entry) => entry.ID === item.ID)?.ReadAt ?? null,
          })))
          const readById = new Map(next.map((item) => [item.ID, item.ReadAt]))
          setPopIns((previous) => previous.filter((item) => !readById.get(item.ID)))
          setError("")
          return next
        })
        .catch(() => { if (current) setError(t("inbox.loadError")); return null })
        .finally(() => { if (current) setLoading(false) })
    }
    refreshListRef.current = refreshList
    const poll = async () => {
      if (!current) return
      if (polling) { pending = true; return }
      polling = true
      try {
        if (!initialized) {
          // The baseline contains no new messages, so existing unread entries
          // do not pop up when a tab first opens.
          const baseline = await apiGet<InboxPoll>("/api/notifications/inbox/poll")
          if (!current) return
          cursor.current = baseline.Cursor ?? { ID: "00000000-0000-0000-0000-000000000000", CreatedAt: "1970-01-01T00:00:00Z" }
          unreadCount.current = baseline.UnreadCount
          setUnread(baseline.UnreadCount)
          initialized = true
          await refreshList()
          return
        }
        const since = cursor.current!
        const query = new URLSearchParams({ since_id: since.ID, since_at: since.CreatedAt })
        const result = await apiGet<InboxPoll>(`/api/notifications/inbox/poll?${query}`)
        if (!current) return
        cursor.current = result.Cursor ?? since
        const fresh = (result.NewInbox ?? []).filter((item) => !item.ReadAt)
        if (openRef.current && result.NewInbox?.length) {
          setItems((previous) => {
            const known = new Set(previous.map((item) => item.ID))
            return [...result.NewInbox.filter((item) => !known.has(item.ID)).reverse(), ...previous]
          })
        }
        const expectedUnread = unreadCount.current + fresh.length
        let poppable = fresh.filter((item) => popInDuration(item.AutoDismissMs) > 0)
        if (result.UnreadCount !== expectedUnread) {
          // A different tab may already have read a freshly delivered item.
          // Confirm its current state before showing a transient card.
          const latest = await refreshList()
          poppable = latest ? poppable.filter((item) => latest.some((entry) => entry.ID === item.ID && !entry.ReadAt)) : []
        } else {
          setError("")
        }
        unreadCount.current = result.UnreadCount
        setUnread(result.UnreadCount)
        if (current && poppable.length > 0) {
          setPopIns((previous) => [...previous, ...poppable.filter((item) => !previous.some((entry) => entry.ID === item.ID))])
        }
      } catch {
        if (current) { setError(t("inbox.loadError")); setLoading(false) }
      } finally {
        polling = false
        if (pending && current) {
          pending = false
          queueMicrotask(() => { void poll() })
        }
      }
    }
    const pollWhenVisible = () => { if (document.visibilityState !== "hidden") void poll() }
    void poll()
    const unsubscribe = onServiceRestored(pollWhenVisible)
    const timer = window.setInterval(pollWhenVisible, 8_000)
    document.addEventListener("visibilitychange", pollWhenVisible)
    window.addEventListener("focus", pollWhenVisible)
    window.addEventListener("cybericebox:inbox-updated", pollWhenVisible)
    const onStorage = (event: StorageEvent) => { if (event.key === READ_SYNC_KEY) { void pollWhenVisible(); if (openRef.current) void refreshList() } }
    window.addEventListener("storage", onStorage)
    return () => {
      current = false
      refreshListRef.current = null
      unsubscribe()
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", pollWhenVisible)
      window.removeEventListener("focus", pollWhenVisible)
      window.removeEventListener("cybericebox:inbox-updated", pollWhenVisible)
      window.removeEventListener("storage", onStorage)
    }
  }, [allowed])

  if (!allowed) return null

  const title = unread ? t("inbox.titleUnread", { count: unread }) : t("inbox.title")

  function announceRead() {
    try {
      const previous = window.localStorage.getItem(READ_SYNC_KEY)
      window.localStorage.setItem(READ_SYNC_KEY, previous === "1" ? "0" : "1")
    } catch { /* Polling still synchronizes read state. */ }
  }

  async function markRead(item: Message) {
    if (item.ReadAt) return true
    try {
      await apiPatch(`/api/notifications/inbox/${encodeURIComponent(item.ID)}/read`, {})
      unreadCount.current = Math.max(0, unreadCount.current - 1)
      setUnread(unreadCount.current)
      setItems((current) => current.map((entry) => entry.ID === item.ID ? { ...entry, ReadAt: new Date().toISOString() } : entry))
      closePopIn(item.ID)
      announceRead()
      return true
    } catch {
      setError(t("inbox.markReadError"))
      return false
    }
  }

  async function followLink(item: Message, href: string) {
    if (!(await markRead(item))) return
    setOpen(false)
    if (href.startsWith("/") && !href.startsWith("//")) router.push(href)
    else window.location.assign(href)
  }

  async function readAll() {
    setError("")
    try {
      await apiPatch("/api/notifications/inbox/read-all", {})
      const now = new Date().toISOString()
      unreadCount.current = 0
      setUnread(0)
      setItems((current) => current.map((item) => ({ ...item, ReadAt: item.ReadAt ?? now })))
      setPopIns([])
      announceRead()
    } catch {
      setError(t("inbox.readAllError"))
    }
  }

  return <>
  <Popover.Root open={open} onOpenChange={(next) => { openRef.current = next; setOpen(next); if (next) void refreshListRef.current?.() }}>
    <Popover.Trigger asChild>
      <button type="button" aria-label={title} className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary">
        <Bell className="h-4 w-4" />
        {unread > 0 && <span className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-primary px-0.5 text-[10px] font-semibold leading-none text-primary-foreground">{unread > 99 ? "99+" : unread}</span>}
      </button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content align="end" sideOffset={20} collisionPadding={12} aria-label={t("inbox.panel")} className={`z-50 flex ${panelMaxHeight} w-[min(32rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground outline-none`}>
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2><span className="sr-only">{t("inbox.title")}</span><Bell aria-hidden="true" className="h-[19px] w-[19px] text-muted-foreground" /></h2>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" disabled={unread === 0} onClick={() => void readAll()} className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent">{t("inbox.readAll")}</button>
            <Popover.Close aria-label={t("inbox.close")} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"><X className="h-4 w-4" /></Popover.Close>
          </div>
        </div>
        {error && <p role="alert" className="mx-3 mt-3 rounded-md bg-[var(--ib-danger-bg)] p-2 text-xs text-[var(--ib-danger)]">{error}</p>}
        <div ref={scrollAreaRef} className="flex min-h-0 flex-col overflow-y-auto">
          {/* loading and empty share one centered box of the same height, so nothing jumps */}
          {loading || items.length === 0 ? <div className="flex min-h-48 flex-1 items-center justify-center">{loading ? <LoadingArea compact label={t("inbox.loadingMessages")} /> : <EmptyState message={t("inbox.empty")} />}</div> : <ul className="divide-y divide-border">{items.map((item, index) => {
            const link = rowLink(item)
            return <li key={item.ID} ref={index === items.length - 1 ? lastItemRef : undefined} className="px-4 py-3 hover:bg-accent/50">
              <NotificationMessageCard
                icon={item.Icon} tone={item.Tone} accentColor={item.AccentColor} title={item.Title}
                // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml -- body is sanitized with DOMPurify
                body={item.Body ? <span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.Body, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }) }} /> : undefined}
                unread={!item.ReadAt} compact
                timestamp={<span className="flex min-w-0 items-center gap-2"><time dateTime={item.CreatedAt}>{new Date(item.CreatedAt).toLocaleString("uk-UA")}</time><EventLabel name={item.EventName} /></span>}
                actions={link ? <a href={link.href} onClick={(event) => { event.preventDefault(); void followLink(item, link.href) }} className="text-sm font-medium text-primary underline-offset-2 hover:underline">{link.label}</a> : !item.ReadAt ? <button type="button" onClick={() => void markRead(item)} className="text-xs font-medium text-primary hover:underline">{t("inbox.markRead")}</button> : undefined}
              />
            </li>
          })}</ul>}
          {loadingOlder && <div className="flex justify-center px-4 py-3"><Spinner size="sm" label={t("admin.loading")} /></div>}
        </div>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
  {popIns.length > 0 && createPortal(<div className="fixed right-4 top-16 z-[70] flex max-h-[calc(100vh-5rem)] flex-col gap-3 overflow-y-auto" aria-live="polite">
    {popIns.slice(0, 3).map((item) => <NotificationPopIn key={item.ID} message={item} onClose={() => closePopIn(item.ID)} onAction={(href) => { const safe = safeHref(href); if (safe) void followLink(item, safe) }} />)}
  </div>, document.body)}
  </>
}
