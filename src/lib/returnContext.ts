import { publicDomain } from "@/lib/origins"

// Return context: an event page (or admin) opens the catalog with
// ?return=<absolute https URL>[&event=<eventID>]. The URL is only accepted on
// the platform domain (or a subdomain), and both values survive in-app
// navigation through sessionStorage.

export type ReturnContext = { returnUrl: string | null; eventId: string | null }

const STORAGE_KEY = "cybericebox.exercises.return"
const EMPTY: ReturnContext = { returnUrl: null, eventId: null }

/** Accepts only https URLs on `${domain}` or its subdomains; everything else → null. */
export function safeReturnUrl(value: string | null | undefined, domain = publicDomain): string | null {
  const root = domain.trim().toLowerCase()
  if (!value || !root) return null
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    if (url.protocol !== "https:") return null
    if (url.username || url.password) return null
    if (host !== root && !host.endsWith(`.${root}`)) return null
    return url.toString()
  } catch {
    return null
  }
}

function cleanEventId(value: string | null | undefined): string | null {
  const id = value?.trim() ?? ""
  return /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null
}

export function readStoredReturnContext(): ReturnContext {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<ReturnContext>
    const returnUrl = safeReturnUrl(parsed.returnUrl ?? null)
    return { returnUrl, eventId: returnUrl ? cleanEventId(parsed.eventId ?? null) : null }
  } catch {
    return EMPTY
  }
}

function store(context: ReturnContext): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(context))
  } catch { /* Storage may be disabled; the bar then lives for this page only. */ }
}

/**
 * Resolves the return context for the current page: a valid ?return= in the
 * query wins and is persisted; otherwise the stored context is used.
 */
export function resolveReturnContext(search: URLSearchParams): ReturnContext {
  const returnUrl = safeReturnUrl(search.get("return"))
  if (returnUrl) {
    const context = { returnUrl, eventId: cleanEventId(search.get("event")) }
    store(context)
    return context
  }
  return readStoredReturnContext()
}

/** Event scope for the page: an explicit ?event= wins over the stored one. */
export function resolveEventId(search: URLSearchParams, context: ReturnContext): string | null {
  return cleanEventId(search.get("event")) ?? context.eventId
}
