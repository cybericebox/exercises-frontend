import { signInURL } from "@/lib/origins"
/**
 * src/lib/auth.ts — Shared Design-System auth-state client helpers.
 *
 * COPY-TO-RP-APPS: This module is app-agnostic and static-export-safe.
 * Copy it verbatim into any Relying-Party (RP) frontend (e.g. main-frontend)
 * as part of the DS sync procedure (see README).
 *
 * `fetchMe` / `Me` are used for auth-state checks.
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
 * so the address isn't hardcoded; fall back to the ID app's /sign-in. The return_to
 * is appended here because only the client knows the current page URL.
 */
export function redirectToSignIn(signInUrl?: string, returnTo?: string): void {
  if (typeof window === "undefined") return
  const url = signInURL(returnTo ?? window.location.href, signInUrl)
  if (url) window.location.href = url
}

