/**
 * xhr.ts — one XMLHttpRequest with credentials, upload progress and the API error conventions.
 *
 * NOT via apiPost: request() in client.ts always sets Content-Type: application/json, which breaks the multipart
 * boundary, and fetch cannot report upload progress. XHR exposes progress while keeping the cookie-authenticated
 * contract (401 → sign-in redirect, 503 → outage state, envelope unwrap, ApiError with the FullCode).
 */
import { ApiError, parseRetryAfter, redirectRequiredAuth } from "@/api/client"
import { apiOrigin } from "@/lib/origins"
import { isNetworkOutage, isUnreachableResponse, reportServiceUnavailable } from "@/lib/serviceStatus"

export type XhrOptions = {
  body?: XMLHttpRequestBodyInit
  headers?: Record<string, string>
  /** Bytes of the request body sent so far, and its total. */
  onUploadProgress?: (loaded: number, total: number) => void
  signal?: AbortSignal
}

/** Sends the request and resolves with the envelope's Data (or the parsed body when there is no envelope). */
export function sendXhr<T>(method: string, path: string, options: XhrOptions = {}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new ApiError(0, null, "Upload aborted"))
      return
    }
    const request = new XMLHttpRequest()
    request.open(method, `${apiOrigin}${path}`)
    request.withCredentials = true
    for (const [name, value] of Object.entries(options.headers ?? {})) request.setRequestHeader(name, value)
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) options.onUploadProgress?.(event.loaded, event.total)
    }
    const onAbort = () => request.abort()
    options.signal?.addEventListener("abort", onAbort, { once: true })
    const done = () => options.signal?.removeEventListener("abort", onAbort)
    request.onerror = () => {
      done()
      if (isNetworkOutage(null)) reportServiceUnavailable()
      reject(new ApiError(0, null, "Network error"))
    }
    request.onabort = () => {
      done()
      reject(new ApiError(0, null, "Upload aborted"))
    }
    request.onload = () => {
      done()
      if (isUnreachableResponse(request.status, request.getResponseHeader("X-Request-ID"))) reportServiceUnavailable()
      if (request.status === 401) {
        redirectRequiredAuth(request.getResponseHeader("X-Sign-In-URL"))
        return
      }
      const raw = request.responseText
      let parsed: unknown = raw
      if (raw) {
        try { parsed = JSON.parse(raw) } catch { /* Preserve the raw response. */ }
      }
      const envelope = parsed && typeof parsed === "object"
        ? parsed as { Status?: { Code?: number; Message?: string }; Data?: unknown }
        : undefined
      if (request.status < 200 || request.status >= 300) {
        reject(new ApiError(request.status, parsed, envelope?.Status?.Message, request.getResponseHeader("X-Sign-In-URL") ?? undefined, envelope?.Status?.Code, parseRetryAfter(request.getResponseHeader("Retry-After")), request.getResponseHeader("X-Request-ID") ?? undefined))
        return
      }
      resolve((envelope ? envelope.Data : parsed) as T)
    }
    request.send(options.body ?? null)
  })
}
