/**
 * accountMenu.ts — the platform-wide account menu.
 *
 * Every frontend shows the same items in the same order: «Профіль»,
 * «Адміністрування» (admin-tier), «Каталог завдань» (admins and event staff),
 * «Головна», then «Вийти» (rendered by the app itself, sign-out is app-specific).
 * The item pointing to the current app is hidden.
 */

export type AccountApp = "main" | "id" | "admin" | "exercises" | "event"
export type AccountLinkKey = "profile" | "admin" | "exercises" | "main"
export type AccountLink = { key: AccountLinkKey; href: string }
export type AccountOrigins = { id: string; admin: string; exercises: string; main: string }

export function accountLinks(
  current: AccountApp,
  { adminTier, catalog, returnTo }: { adminTier: boolean; catalog: boolean; returnTo: string },
  origins: AccountOrigins,
): AccountLink[] {
  const links: AccountLink[] = []
  if (current !== "id") links.push({ key: "profile", href: `${origins.id}/profile${returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ""}` })
  if (current !== "admin" && adminTier) links.push({ key: "admin", href: origins.admin || "/" })
  if (current !== "exercises" && catalog) links.push({ key: "exercises", href: origins.exercises || "/" })
  if (current !== "main") links.push({ key: "main", href: origins.main || "/" })
  return links
}

/** Catalog visibility from GET /exercises/access — the same rule as the catalog's own gate. */
export function catalogAllowed(access: { IsAdmin?: boolean; Events?: unknown[] | null } | null | undefined): boolean {
  return Boolean(access?.IsAdmin) || (access?.Events?.length ?? 0) > 0
}
