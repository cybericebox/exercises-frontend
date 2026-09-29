/**
 * accountMenu.ts — the platform-wide account menu, one copy per app (keep them identical).
 *
 * Every frontend shows the same entries in the same order, with the same labels and icons:
 * «Профіль», «Адміністрування» (admin-tier), «Каталог завдань» (admins and event staff), a
 * divider, «Файли cookie», a divider, «Вийти». The link to the current app is hidden; the logo
 * leads to the landing, so there is no «Головна». Profile and catalog links carry return_to.
 * The app renders the entries; sign-out and the cookie panel are app-specific.
 */

import { Cookie, LogOut, Puzzle, Settings, UserRound, type LucideIcon } from "lucide-react"

export type AccountApp = "main" | "id" | "admin" | "exercises" | "event"
export type AccountLinkKey = "profile" | "admin" | "exercises"
export type AccountLink = { key: AccountLinkKey; href: string }
export type AccountOrigins = { id: string; admin: string; exercises: string }
export type AccountAccess = { adminTier: boolean; catalog: boolean; returnTo: string }
export type AccountMenuEntry =
  | ({ kind: "link" } & AccountLink)
  | { kind: "divider" }
  | { kind: "cookies" }
  | { kind: "signOut" }

/** i18n keys, the same in every app. `cookiesAria` is the full name of the short cookie label. */
export const ACCOUNT_MENU_LABELS = {
  profile: "accountMenu.profile",
  admin: "accountMenu.admin",
  exercises: "accountMenu.exercises",
  cookies: "consent.menuLabel",
  cookiesAria: "consent.settings",
  signOut: "accountMenu.signOut",
} as const

/** lucide icons, the same in every app; rendered with ACCOUNT_MENU_ICON_PROPS in the dim text colour. */
export const ACCOUNT_MENU_ICONS: Record<AccountLinkKey | "cookies" | "signOut", LucideIcon> = {
  profile: UserRound,
  admin: Settings,
  exercises: Puzzle,
  cookies: Cookie,
  signOut: LogOut,
}
export const ACCOUNT_MENU_ICON_PROPS = { size: 16, strokeWidth: 1.6, "aria-hidden": true } as const

/** `href` with ?return_to=<returnTo>, so the target app can offer a way back. */
export function withReturnTo(href: string, returnTo: string): string {
  if (!returnTo) return href
  return `${href}${href.includes("?") ? "&" : "?"}return_to=${encodeURIComponent(returnTo)}`
}

export function accountLinks(current: AccountApp, { adminTier, catalog, returnTo }: AccountAccess, origins: AccountOrigins): AccountLink[] {
  const links: AccountLink[] = []
  if (current !== "id") links.push({ key: "profile", href: withReturnTo(`${origins.id}/profile`, returnTo) })
  if (current !== "admin" && adminTier) links.push({ key: "admin", href: origins.admin || "/" })
  if (current !== "exercises" && catalog) links.push({ key: "exercises", href: withReturnTo(origins.exercises || "/", returnTo) })
  return links
}

/** The whole menu below the name/email header. The event site adds its own items after the links. */
export function accountMenu(current: AccountApp, access: AccountAccess, origins: AccountOrigins): AccountMenuEntry[] {
  return [
    ...accountLinks(current, access, origins).map((link) => ({ kind: "link" as const, ...link })),
    { kind: "divider" },
    { kind: "cookies" },
    { kind: "divider" },
    { kind: "signOut" },
  ]
}

/** Catalog visibility from GET /exercises/access — the same rule as the catalog's own gate. */
export function catalogAllowed(access: { IsAdmin?: boolean; Events?: unknown[] | null } | null | undefined): boolean {
  return Boolean(access?.IsAdmin) || (access?.Events?.length ?? 0) > 0
}
