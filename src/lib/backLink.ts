import { STORAGE_BACK } from "@/lib/storageKeys"
/**
 * backLink.ts — where the "back" arrow leads, one copy per app (id, exercises; keep them identical).
 *
 * The source is ?return_to (callers append the page they came from), else a document.referrer
 * from another platform app. Both must be https URLs on the platform domain; anything else is
 * ignored (no open redirect). The last source is kept in sessionStorage for the tab, so in-app
 * navigation doesn't lose it. The kind of the source picks the arrow's tooltip.
 */

export type BackKind = "landing" | "admin" | "catalog" | "event"
export type BackLink = { kind: BackKind; href: string }
/** Bare hostnames of the platform apps; `domain` is the landing (apex) host. */
export type BackHosts = { domain: string; admin: string; exercises: string; id: string; api: string }
/** Only these sources get the destination tooltip; the others keep the app's plain back behaviour. */
export type BackDestination = Exclude<BackKind, "landing">

/** i18n keys of the destination tooltips (also the arrow's aria-label), the same in every app. */
export const BACK_LABELS: Record<BackDestination, string> = {
  admin: "back.toAdmin",
  catalog: "back.toCatalog",
  event: "back.toEvent",
}


const hostOf = (origin: string) => {
  try {
    return origin ? new URL(origin).hostname.toLowerCase() : ""
  } catch {
    return ""
  }
}

export function backHosts(domain: string, origins: { admin: string; exercises: string; id: string; api: string }): BackHosts {
  return {
    domain: domain.trim().toLowerCase(),
    admin: hostOf(origins.admin),
    exercises: hostOf(origins.exercises),
    id: hostOf(origins.id),
    api: hostOf(origins.api),
  }
}

/** A platform URL and the app it belongs to, or null (foreign, not https, id/api, unparseable). */
export function classifyBack(value: string | null | undefined, hosts: BackHosts): BackLink | null {
  if (!value || !hosts.domain) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase()
  if (url.protocol !== "https:" || url.username || url.password) return null
  // The platform is reached on its fixed external port: never keep one (e.g. a dev :3001).
  const href = `https://${host}${url.pathname}${url.search}${url.hash}`
  if (host === hosts.domain) return { kind: "landing", href }
  if (host === hosts.admin) return { kind: "admin", href }
  if (host === hosts.exercises) return { kind: "catalog", href }
  if (host === hosts.id || host === hosts.api) return null
  // Event sites are <tag>.<domain>.
  const label = host.endsWith(`.${hosts.domain}`) ? host.slice(0, -hosts.domain.length - 1) : ""
  return label && !label.includes(".") ? { kind: "event", href } : null
}

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">

/**
 * The back link for this page: a valid ?return_to wins, then a referrer from another platform
 * app, then the one stored for this tab. A new source replaces the stored one.
 */
export function resolveBack(
  { returnTo, referrer, currentHost }: { returnTo: string | null; referrer: string; currentHost: string },
  hosts: BackHosts,
  storage: Storage | null,
): BackLink | null {
  const fromReturnTo = classifyBack(returnTo, hosts)
  const fromReferrer = classifyBack(referrer, hosts)
  const fresh = fromReturnTo ?? (fromReferrer && new URL(fromReferrer.href).hostname !== currentHost.toLowerCase() ? fromReferrer : null)
  try {
    if (fresh) {
      storage?.setItem(STORAGE_BACK, fresh.href)
      return fresh
    }
    return classifyBack(storage?.getItem(STORAGE_BACK), hosts)
  } catch {
    // Storage may be disabled: the link then lives for this page only.
    return fresh
  }
}

/** The destination tooltip key, or null when the source keeps the plain back behaviour. */
export function backLabel(link: BackLink | null): string | null {
  return link && link.kind !== "landing" ? BACK_LABELS[link.kind] : null
}
