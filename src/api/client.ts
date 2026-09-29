// Minimal fetch-based API client.
// The API origin is api.<NEXT_PUBLIC_DOMAIN> or NEXT_PUBLIC_API_DOMAIN: every
// frontend calls the single api host cross-origin with credentials included,
// and the browser stores/sends the host-scoped __Host-session cookie. No
// silent-auth bootstrap — a plain credentialed fetch is authoritative.

import { apiOrigin } from "@/lib/origins"
import { isUnavailableStatus, reportServiceUnavailable } from "@/lib/serviceStatus"
const BASE_URL = apiOrigin

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message?: string,
    // Sign-in URL advertised by the backend via the X-Sign-In-URL header on 401,
    // so callers can redirect without computing the address.
    public readonly signInUrl?: string,
    // Stable numeric FullCode from the envelope (Status.Code). This — not the
    // English message — is the i18n key callers localize against (see i18n/apiError).
    public readonly code?: number
  ) {
    super(message ?? `API error ${status}`)
    this.name = "ApiError"
  }
}

// ApiOptions controls cross-cutting request behavior.
//   required (default true) — a 401 writes the return_to cookie and redirects
//       the browser to the backend-advertised sign-in page (X-Sign-In-URL).
//       The promise never resolves (navigation is underway), so no catch/finally
//       runs on the caller.
//   required: false — opt out (e.g. fetchMe, which treats 401 as "anonymous").
//       The 401 is thrown as ApiError so the caller can handle it.
export type ApiOptions = { required?: boolean }

// portless strips the port from a URL and forces https:, matching the backend's
// expectations for return_to (port-free, https-only). Returns the input unchanged
// in non-browser contexts (SSR/static export safety).
function portless(href: string): string {
  if (typeof window === "undefined") return href
  try {
    const u = new URL(href)
    u.port = ""
    u.protocol = "https:"
    return u.toString()
  } catch {
    console.warn("[client] portless: unexpected unparseable URL:", href)
    return href
  }
}

// writeReturnToCookie writes the current page URL (portless, https) as the
// return_to cookie the backend consumes at session creation. The backend rejects
// URLs with a port and requires https, so the value must be portless https.
function writeReturnToCookie(): void {
  if (typeof window === "undefined") return
  document.cookie = `return_to=${encodeURIComponent(portless(window.location.href))}; path=/; SameSite=Lax; Secure`
}

// redirectToSignInPage is inlined here (no import of lib/auth) to avoid a
// circular dependency, since lib/auth imports ApiError from this module.
// The return_to is carried by the cookie written before calling this function;
// we navigate directly to signInUrl without appending query params.
// replace() is used so the 401'd page is NOT left in browser history, preventing
// a back-button re-triggering the 401 redirect loop.
function redirectToSignInPage(signInUrl: string | null): void {
  if (typeof window === "undefined") return
  window.location.replace(signInUrl || portless(window.location.origin) + "/sign-in")
}

/** Shared by JSON requests and the progress-reporting multipart upload. */
export function redirectRequiredAuth(signInUrl: string | null): void {
  writeReturnToCookie()
  redirectToSignInPage(signInUrl)
}

// Shared by request() and apiPostMultipart(): 401 redirect, then envelope
// unwrap into ApiError/Data. Split out so the multipart path can skip the
// JSON-only fetch() call above without duplicating this logic.
async function finishRequest<T>(res: Response, opts: ApiOptions): Promise<T> {
  if (isUnavailableStatus(res.status)) reportServiceUnavailable()

  // Centralized auth handling: required (default true) → write return_to cookie
  // and redirect to sign-in. Returning a never-resolving promise stops the
  // caller's success/catch paths from running while the browser navigates away.
  // required:false → fall through to throw ApiError so callers treat it as anon.
  if (res.status === 401 && (opts.required ?? true)) {
    redirectRequiredAuth(res.headers.get("X-Sign-In-URL"))
    return new Promise<never>(() => {})
  }

  const contentType = res.headers.get("content-type") ?? ""
  const raw = await res.text()
  let parsed: unknown = raw
  if (raw && contentType.includes("application/json")) {
    try {
      parsed = JSON.parse(raw)
    } catch {
      // Malformed JSON body — keep the raw text rather than throwing.
      parsed = raw
    }
  }
  // (empty body → parsed stays "" → envelope undefined → handled below)

  // The backend wraps every JSON response in an envelope: { Status: { Code,
  // Message }, Data }. Unwrap it here so callers receive the payload directly.
  const envelope =
    parsed && typeof parsed === "object"
      ? (parsed as { Status?: { Code?: number; Message?: string }; Data?: unknown })
      : undefined

  if (!res.ok) {
    throw new ApiError(
      res.status,
      parsed,
      envelope?.Status?.Message,
      res.headers.get("X-Sign-In-URL") ?? undefined,
      envelope?.Status?.Code
    )
  }

  // Data is absent for empty 200s (e.g. DELETE) — return undefined in that case.
  return (envelope ? envelope.Data : parsed) as T
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  opts: ApiOptions = {}
): Promise<T> {
  // Dev/demo mode: answer from the in-memory mock API (never in a normal build).
  if (process.env.NEXT_PUBLIC_USE_MOCKS === "1") {
    const { mockRequest } = await import("@/mocks/api")
    return mockRequest<T>(init.method ?? "GET", path, init.body,
      (status, code, message) => new ApiError(status, { Status: { Code: code, Message: message } }, message, undefined, code))
  }
  const url = `${BASE_URL}${path}`

  let res: Response
  try {
    res = await fetch(url, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    })
  } catch (error) {
    // A caller-initiated abort (AbortController) is not an outage.
    if (!init.signal?.aborted) reportServiceUnavailable()
    throw error
  }

  return finishRequest<T>(res, opts)
}

// apiPostMultipart — POST a FormData body (e.g. a file upload) with the same
// credentials / 401-redirect / envelope-unwrap / error conventions as
// request(). NOT via apiPost: request() always sets Content-Type:
// application/json, which breaks the multipart boundary. There is no CSRF
// header convention in this client to preserve — auth here is the
// __Host-session cookie sent via credentials:"include", same as every other
// call. See api/exercises/files.ts for the XHR progress-reporting variant
// used where upload progress must be surfaced to the caller.
export async function apiPostMultipart<T>(
  path: string,
  form: FormData,
  opts: ApiOptions = {}
): Promise<T> {
  const url = `${BASE_URL}${path}`

  let res: Response
  try {
    res = await fetch(url, { method: "POST", credentials: "include", body: form })
  } catch (error) {
    reportServiceUnavailable()
    throw error
  }

  return finishRequest<T>(res, opts)
}

/** File name from Content-Disposition (RFC 6266: filename* wins over filename). */
export function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null
  const extended = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header)
  if (extended) {
    try { return decodeURIComponent(extended[1].trim().replace(/^"|"$/g, "")) } catch { /* fall back to filename= */ }
  }
  const plain = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/.exec(header)
  if (!plain) return null
  const name = (plain[1] ?? plain[2] ?? "").trim()
  return name || null
}

export type BlobResponse = { blob: Blob; filename: string | null }

// apiPostBlob — POST JSON and receive a binary body (e.g. application/zip).
// Errors go through finishRequest so 401 redirects and ApiError codes match
// every other call. The API is cross-origin: the backend must list
// Content-Disposition in Access-Control-Expose-Headers, otherwise the name is null.
export async function apiPostBlob(path: string, body: unknown, opts: ApiOptions = {}): Promise<BlobResponse> {
  const url = `${BASE_URL}${path}`
  let res: Response
  try {
    res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  } catch (error) {
    reportServiceUnavailable()
    throw error
  }
  if (!res.ok) return finishRequest<never>(res, opts)
  return { blob: await res.blob(), filename: filenameFromContentDisposition(res.headers.get("Content-Disposition")) }
}

/** Browsers reject keepalive bodies above 64 KiB; keep a margin for headers. */
export const KEEPALIVE_BODY_LIMIT = 60_000

// apiKeepalive — fire-and-forget write that survives page unload (pagehide).
// Returns false when the body is too large or fetch throws synchronously; the
// caller keeps its browser-side copy in that case.
export function apiKeepalive(method: "PUT" | "PATCH", path: string, body: unknown): boolean {
  const payload = JSON.stringify(body)
  if (new Blob([payload]).size > KEEPALIVE_BODY_LIMIT) return false
  try {
    void fetch(`${BASE_URL}${path}`, {
      method,
      keepalive: true,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: payload,
    }).catch(() => undefined)
    return true
  } catch {
    return false
  }
}

export function apiGet<T>(path: string, init?: RequestInit, opts?: ApiOptions): Promise<T> {
  return request<T>(path, { ...init, method: "GET" }, opts)
}

export function apiPost<T>(
  path: string,
  body: unknown,
  init?: RequestInit,
  opts?: ApiOptions
): Promise<T> {
  return request<T>(path, { ...init, method: "POST", body: JSON.stringify(body) }, opts)
}

export function apiPut<T>(
  path: string,
  body: unknown,
  init?: RequestInit,
  opts?: ApiOptions
): Promise<T> {
  return request<T>(path, { ...init, method: "PUT", body: JSON.stringify(body) }, opts)
}

export function apiPatch<T>(
  path: string,
  body: unknown,
  init?: RequestInit,
  opts?: ApiOptions
): Promise<T> {
  return request<T>(path, { ...init, method: "PATCH", body: JSON.stringify(body) }, opts)
}

export function apiDelete<T>(path: string, init?: RequestInit, opts?: ApiOptions): Promise<T> {
  return request<T>(path, { ...init, method: "DELETE" }, opts)
}

// Avatar paths returned by the API are relative to the API host.
export function mediaUrl(src: string | undefined | null): string | undefined {
  if (!src) return undefined
  return src.startsWith("/") ? `${BASE_URL}${src}` : src
}
