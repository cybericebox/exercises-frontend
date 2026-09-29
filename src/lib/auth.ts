/**
 * src/lib/auth.ts — Shared Design-System auth-state client helpers.
 *
 * COPY-TO-RP-APPS: This module is app-agnostic and static-export-safe.
 * Copy it verbatim into any Relying-Party (RP) frontend (e.g. main-frontend)
 * as part of the DS sync procedure (see README).
 *
 * Usage on id-frontend (the Authorization Server):
 *   - `fetchMe` / `Me` are used for auth-state checks.
 *   - `rememberReturnTo` is called on mount by each auth page to persist the
 *     return_to cookie, which the backend consumes at session creation.
 *   - `safeReturnTo` / `redirectIfAuthed` guard guest-only pages.
 *
 * No JSX — plain TypeScript; safe to import without 'use client' propagation issues.
 */

import { apiGet, ApiError } from "@/api/client"

// ---------------------------------------------------------------------------
// /me — identity object returned by the RP's /api/me endpoint.
// On id itself the equivalent is /api/account (different shape), but RP apps
// expose /api/me as a lightweight signed-in check.
// ---------------------------------------------------------------------------

export interface Me {
  ID: string
  FirstName: string
  LastName: string
  Email: string
  Role: string
  Permissions: string[]
  // Avatar URL — the backend's UserInfo field is "Picture".
  Picture?: string
}

/**
 * fetchMe — GET /api/me with credentials included.
 *
 * Returns the `Me` object on 200 (signed in), or `null` on 401 (no session).
 * Throws only on unexpected errors (5xx, network failures, etc.).
 *
 * DS NOTE: RP apps call this on every page load to determine auth state.
 */
export async function fetchMe(): Promise<Me | null> {
  try {
    // required:false → treat a 401 as "anonymous" rather than redirecting to sign-in.
    return await apiGet<Me>("/api/auth/me", undefined, { required: false })
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      return null
    }
    throw err
  }
}

/**
 * Redirect to the sign-in page, preserving where to return after auth. Prefer
 * the backend-advertised URL (ApiError.signInUrl from the X-Sign-In-URL header)
 * so the address isn't hardcoded; fall back to the local /sign-in. The return_to
 * is appended here because only the client knows the current page URL.
 */
export function redirectToSignIn(signInUrl?: string, returnTo?: string): void {
  if (typeof window === "undefined") return
  const ret = returnTo ?? window.location.href
  const base = signInUrl || "/sign-in"
  const url = new URL(base, window.location.origin)
  url.searchParams.set("return_to", ret)
  window.location.href = url.toString()
}

/**
 * safeReturnTo — open-redirect guard. Accepts a return_to only within the
 * platform domain (any subdomain), mirroring the backend's buildCallbackURL
 * guard; everything else (off-domain, relative-but-not-/, unparseable) falls
 * back to /profile. This prevents an attacker-supplied ?return_to=https://evil.com
 * from bouncing an authed user off-platform.
 *
 * id is served from id.<domain>; the platform root domain is the current host
 * minus the leading "id." prefix.
 */
export function safeReturnTo(returnTo?: string, fallback = "/profile"): string {
  if (!returnTo) return fallback
  const root = window.location.hostname.replace(/^id\./, "")
  try {
    const u = new URL(returnTo)
    const h = u.hostname.toLowerCase()
    if (u.protocol === "https:" && (h === root || h.endsWith("." + root))) {
      // Strip any port: the platform is always reached on its fixed external
      // port, so a redirect target must never carry one (e.g. a dev :3001).
      return `https://${u.hostname}${u.pathname}${u.search}${u.hash}`
    }
  } catch { /* Invalid return URL falls back to the default destination. */ }
  return fallback
}

/**
 * rememberReturnTo — persists the return_to cookie on auth-page mount.
 *
 * Writes `document.cookie = return_to=<portless-https-url>; ...` ONLY when
 * `returnTo` is a genuine absolute https URL within the platform domain (same
 * trust logic as `safeReturnTo`). Relative paths and off-platform URLs are
 * silently ignored — the backend's ConsumeReturnTo trusts only absolute
 * same-platform https URLs with no port.
 *
 * NOTE: Minor duplication of `writeReturnToCookie` in src/api/client.ts is
 * intentional — client.ts cannot import auth.ts (circular dep risk) and the
 * two call sites have different inputs (current-href vs caller-supplied URL).
 *
 * SSR/static-export safe: no-ops when `typeof window === "undefined"`.
 */
export function rememberReturnTo(returnTo?: string): void {
  if (typeof window === "undefined") return
  if (!returnTo) return
  const root = window.location.hostname.replace(/^id\./, "")
  try {
    const u = new URL(returnTo)
    const h = u.hostname.toLowerCase()
    if (u.protocol === "https:" && (h === root || h.endsWith("." + root))) {
      // Force portless https — mirrors Task 7 writeReturnToCookie convention.
      const portless = `https://${u.hostname}${u.pathname}${u.search}${u.hash}`
      document.cookie = `return_to=${encodeURIComponent(portless)}; path=/; SameSite=Lax; Secure`
    }
  } catch {
    // Unparseable URL — do nothing.
  }
}

/**
 * On a guest-only page (sign-in/up, password reset), bounce an already-authed
 * user away. id reads the master cookie directly, so fetchMe is authoritative.
 * Returns true while a redirect is in flight (render nothing/loader).
 */
export async function redirectIfAuthed(returnTo?: string): Promise<boolean> {
  const me = await fetchMe()
  if (!me) return false
  const dest = safeReturnTo(returnTo)
  window.location.href = dest
  return true
}
