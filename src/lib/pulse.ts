// One notifications pulse loop per tab, shared by the banner bar and the inbox bell.
// GET /api/notifications/pulse answers with the banner list version and (signed in) the inbox cursor and
// unread count. It supports ETag/304, so it is never fetched with cache:"no-store".
import { apiGet } from "@/api/client"

export const PULSE_SITE = "exercises"
export const PULSE_INTERVAL_MS = 30_000
export const PULSE_JITTER = 0.2
export const PULSE_MIN_GAP_MS = 5_000

export type Pulse = { Banners: string; Inbox: { Cursor: string; Unread: number } | null }
type Listener = (pulse: Pulse) => void
type Loop = { event: string; listeners: Set<Listener>; last: Pulse | null; timer: number | null; lastAt: number; inFlight: boolean }

const loops = new Map<string, Loop>()
let listening = false

export function pulseQuery(event?: string): string {
  const query = new URLSearchParams({ site: PULSE_SITE })
  if (event) query.set("event", event)
  return `?${query.toString()}`
}

/** 30 s ± 20%. `random` is injectable for tests. */
export function nextDelay(random: () => number = Math.random): number {
  return Math.round(PULSE_INTERVAL_MS * (1 - PULSE_JITTER + 2 * PULSE_JITTER * random()))
}

function hidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden"
}

function schedule(loop: Loop) {
  if (loop.timer !== null) window.clearTimeout(loop.timer)
  loop.timer = null
  if (hidden() || loop.listeners.size === 0) return
  loop.timer = window.setTimeout(() => { loop.timer = null; void run(loop) }, nextDelay())
}

async function run(loop: Loop) {
  if (loop.inFlight || hidden() || loops.get(loop.event) !== loop) return
  loop.inFlight = true
  loop.lastAt = Date.now()
  try {
    const data = await apiGet<Pulse>(`/api/notifications/pulse${pulseQuery(loop.event || undefined)}`, undefined, { required: false })
    if (data && typeof data === "object") {
      loop.last = { Banners: String(data.Banners ?? ""), Inbox: data.Inbox ?? null }
      for (const listener of [...loop.listeners]) listener(loop.last)
    }
  } catch {
    // A pulse outage never blocks the page: the next tick tries again.
  } finally {
    loop.inFlight = false
    schedule(loop)
  }
}

/** One immediate pulse, at most once per PULSE_MIN_GAP_MS (visible / focus / online). */
function wake() {
  if (hidden()) return
  for (const loop of loops.values()) {
    if (Date.now() - loop.lastAt >= PULSE_MIN_GAP_MS) void run(loop)
    else schedule(loop)
  }
}

function onVisibility() {
  if (hidden()) { for (const loop of loops.values()) { if (loop.timer !== null) window.clearTimeout(loop.timer); loop.timer = null } return }
  wake()
}

function attach() {
  if (listening || typeof window === "undefined") return
  listening = true
  document.addEventListener("visibilitychange", onVisibility)
  window.addEventListener("focus", wake)
  window.addEventListener("online", wake)
}

function detach() {
  if (!listening || loops.size > 0) return
  listening = false
  document.removeEventListener("visibilitychange", onVisibility)
  window.removeEventListener("focus", wake)
  window.removeEventListener("online", wake)
}

/** Joins the tab's pulse loop (event = the event scope, if any). The last pulse is replayed at once. */
export function subscribePulse(listener: Listener, event?: string): () => void {
  const key = event ?? ""
  let loop = loops.get(key)
  if (!loop) {
    loop = { event: key, listeners: new Set(), last: null, timer: null, lastAt: 0, inFlight: false }
    loops.set(key, loop)
  }
  loop.listeners.add(listener)
  attach()
  if (loop.last) listener(loop.last)
  else if (!loop.inFlight && loop.listeners.size === 1) void run(loop)
  else if (loop.timer === null && !loop.inFlight) schedule(loop)
  const joined = loop
  return () => {
    joined.listeners.delete(listener)
    if (joined.listeners.size > 0) return
    if (joined.timer !== null) window.clearTimeout(joined.timer)
    loops.delete(key)
    detach()
  }
}

/** The newest pulse the tab has seen for a scope. */
export function latestPulse(event?: string): Pulse | null {
  return loops.get(event ?? "")?.last ?? null
}
