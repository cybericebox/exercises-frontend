import { siteBannerDismissedKey } from "@/lib/storageKeys"
// Site banners (docs/BROADCASTS.md, «Банери»): pure model shared in spirit by every frontend.
// GET /api/notifications/banners is public; the server already filters by activity, window and audience.
// Site/system banners are dismissed in the browser only, under `${ID}:${Version}` (an edited banner gets a new Version);
// personal banners are dismissed on the server (PATCH /api/notifications/banners/:id/dismiss).

export type BannerLevel = "info" | "warning" | "critical"

export type SiteBanner = {
  ID: string
  Kind?: "site" | "system" | "personal"
  Title?: string
  Text: string
  LinkURL?: string
  LinkLabel?: string
  Level?: string
  Dismissible?: boolean
  Version?: string | number
}

const SEVERITY: Record<BannerLevel, number> = { critical: 0, warning: 1, info: 2 }

type StorageLike = Pick<Storage, "getItem" | "setItem">

export function bannerLevel(level: string | undefined): BannerLevel {
  return level === "critical" || level === "warning" ? level : "info"
}

/** Only in-app paths and http(s) links are rendered; javascript:, data:, protocol-relative etc. are dropped. */
export function bannerHref(url: string | undefined): string | null {
  const value = (url ?? "").trim()
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return value
  if (/^https?:\/\//i.test(value)) return value
  return null
}

/** Most severe first; the server order is kept within one level. */
export function sortBanners(items: readonly SiteBanner[]): SiteBanner[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => SEVERITY[bannerLevel(a.item.Level)] - SEVERITY[bannerLevel(b.item.Level)] || a.index - b.index)
    .map(({ item }) => item)
}

export function dismissKey(banner: Pick<SiteBanner, "ID" | "Version">): string {
  return siteBannerDismissedKey(banner.ID, banner.Version ?? "")
}

function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

export function isDismissed(banner: SiteBanner, storage: StorageLike | null = browserStorage()): boolean {
  if (!banner.Dismissible || banner.Kind === "personal" || !storage) return false
  try {
    return storage.getItem(dismissKey(banner)) === "1"
  } catch {
    return false
  }
}

export function rememberDismissed(banner: SiteBanner, storage: StorageLike | null = browserStorage()): void {
  if (!storage || banner.Kind === "personal") return
  try {
    storage.setItem(dismissKey(banner), "1")
  } catch {
    // the banner stays hidden for this page view only
  }
}

/** Tolerant parse of the response: anything that is not a list of banners with text yields nothing. */
export function parseBanners(data: unknown): SiteBanner[] {
  if (!Array.isArray(data)) return []
  return data
    .filter((item): item is SiteBanner => !!item && typeof item === "object" && typeof item.ID === "string")
    // A personal banner may carry only a Title: it is shown as the text.
    .map((item) => item.Kind === "personal" && !item.Text && typeof item.Title === "string" && item.Title !== "" ? { ...item, Text: item.Title } : item)
    .filter((item) => typeof item.Text === "string" && item.Text !== "")
}
