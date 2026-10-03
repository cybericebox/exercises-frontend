// Client token (anti-DoS), the same file in every frontend.
//
// With NEXT_PUBLIC_DOS_PROTECTION on, the first visit passes an invisible bot check of the chosen provider and
// POSTs the token to /api/client-token; the API answers with an HttpOnly cookie (__Host-client, about a day,
// valid for every frontend because they share one API host). JS never sees the cookie, only its expiry.
// `fetchWithClientToken` wraps the API calls: it ensures the token first and, when the API answers
// 429 + `X-Client-Token: required`, refreshes it and retries the request ONCE. A plain 429 is an ordinary
// rate limit and is never retried here.

import { apiOrigin } from "@/lib/origins"
import { executeCaptcha } from "@/lib/captcha"
import { STORAGE_CLIENT_TOKEN_EXPIRES } from "@/lib/storageKeys"

const REFRESH_MARGIN_MS = 60_000
const FAILURE_BACKOFF_MS = 15_000
const RATE_LIMIT_BACKOFF_MS = 30_000
const MAX_BACKOFF_MS = 10 * 60_000

export function dosProtectionOn(): boolean {
  return ["on"].includes((process.env.NEXT_PUBLIC_DOS_PROTECTION ?? "").trim())
}

let inflight: Promise<boolean> | null = null
// The backend answered 404: DOS protection is off there. Remembered for the session.
let backendOff = false
let backoffUntil = 0
// Used when localStorage is unavailable.
let memoryExpiry = 0

function readExpiry(): number {
  try {
    const stored = Number(localStorage.getItem(STORAGE_CLIENT_TOKEN_EXPIRES))
    if (Number.isFinite(stored) && stored > 0) return Math.max(stored, memoryExpiry)
  } catch {
    // storage is unavailable: the in-memory value is used
  }
  return memoryExpiry
}

function writeExpiry(ms: number): void {
  memoryExpiry = ms
  try {
    localStorage.setItem(STORAGE_CLIENT_TOKEN_EXPIRES, String(ms))
  } catch {
    // a per-origin convenience only
  }
}

function clearExpiry(): void {
  memoryExpiry = 0
  try {
    localStorage.removeItem(STORAGE_CLIENT_TOKEN_EXPIRES)
  } catch {
    // ignore
  }
}

function tokenIsFresh(): boolean {
  return readExpiry() - REFRESH_MARGIN_MS > Date.now()
}

function backOff(ms: number): void {
  backoffUntil = Date.now() + Math.min(ms, MAX_BACKOFF_MS)
}

async function fetchToken(): Promise<boolean> {
  try {
    const captcha = await executeCaptcha("clientToken")
    const res = await fetch(`${apiOrigin}/api/client-token`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ RecaptchaToken: captcha }),
    })
    if (res.status === 404) {
      backendOff = true
      return false
    }
    if (res.status === 429) {
      const seconds = Number(res.headers.get("Retry-After"))
      backOff(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : RATE_LIMIT_BACKOFF_MS)
      return false
    }
    if (!res.ok) {
      backOff(FAILURE_BACKOFF_MS)
      return false
    }
    const body = (await res.json().catch(() => null)) as { Data?: { ExpiresAt?: string } } | null
    const expires = Date.parse(body?.Data?.ExpiresAt ?? "")
    // Without a usable expiry the cookie is still set; treat it as valid for the margin only.
    writeExpiry(Number.isFinite(expires) ? expires : Date.now() + 2 * REFRESH_MARGIN_MS)
    return true
  } catch {
    backOff(FAILURE_BACKOFF_MS)
    return false
  }
}

/**
 * Makes sure the client cookie is present and fresh. One request even for parallel callers. Never throws and
 * never blocks for ever: resolves false when no token is needed or it could not be obtained (the caller lets
 * its own request go and surfaces its own error; the next call tries again after a short back-off).
 */
export function ensureClientToken(force = false): Promise<boolean> {
  if (!dosProtectionOn() || backendOff) return Promise.resolve(false)
  if (!force && tokenIsFresh()) return Promise.resolve(true)
  if (inflight) return inflight
  if (Date.now() < backoffUntil) return Promise.resolve(false)
  if (force) clearExpiry()
  inflight = fetchToken().finally(() => {
    inflight = null
  })
  return inflight
}

async function sendWithToken(send: () => Promise<Response>): Promise<Response> {
  await ensureClientToken()
  const res = await send()
  if (res.status !== 429 || res.headers.get("X-Client-Token") !== "required") return res
  if (!(await ensureClientToken(true))) return res
  return send()
}

/**
 * `fetch` for API calls: awaits the client token first, refreshes it and retries ONCE on `X-Client-Token: required`.
 * With DOS protection off it is the plain request, without extra async hops.
 */
export function fetchWithClientToken(send: () => Promise<Response>): Promise<Response> {
  return dosProtectionOn() ? sendWithToken(send) : send()
}

/** Test hook: reset the module state. */
export function resetClientTokenForTests(): void {
  inflight = null
  backendOff = false
  backoffUntil = 0
  memoryExpiry = 0
}
