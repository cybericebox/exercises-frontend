// Retry for reads the server turned away because it is overloaded.
// Framework-free and dependency-free: the same file is copied verbatim into
// every frontend; only the call site in each client differs.
//
// Port contract (what each client must do for this file to work):
// - wrap the fetch of every request in fetchWithOverloadRetry, passing the
//   method and the caller's AbortSignal; only the returned (final) Response
//   may reach the outage report and the error mapping;
// - store parseRetryAfterSeconds(res.headers.get("Retry-After")) on the thrown
//   error as `retryAfter` or `retryAfterSeconds` (a number, 0 included, when the
//   header was present; undefined otherwise), next to its numeric `status`.
//   isOverloadError reads exactly these fields.

/** Statuses that can mean "busy, ask again shortly" (a 503 only with Retry-After). */
export const OVERLOAD_STATUSES = [429, 503]

/** A Retry-After longer than this is not worth waiting for in a pending request. */
const MAX_RETRY_AFTER_MS = 10_000
const BASE_DELAY_MS = 500
const MAX_BACKOFF_MS = 4_000
const DEFAULT_MAX_ATTEMPTS = 4

/**
 * Retry-After in milliseconds from now: delta-seconds or an HTTP-date (a past
 * date gives 0). Anything else (absent, "-1", junk) gives null.
 */
function retryAfterMs(header: string | null | undefined): number | null {
  const value = header?.trim()
  if (!value) return null
  if (/^\d+(\.\d+)?$/.test(value)) return Number(value) * 1000
  // An HTTP-date always has a weekday or month name; this keeps numeric junk away from Date.parse.
  if (!/[a-z]/i.test(value)) return null
  const at = Date.parse(value)
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null
}

/** Retry-After as whole seconds (rounded up, 0 allowed) for the client's error; undefined when absent or unparseable. */
export function parseRetryAfterSeconds(header: string | null): number | undefined {
  const ms = retryAfterMs(header)
  return ms === null ? undefined : Math.ceil(ms / 1000)
}

/**
 * Delay before retry number `attempt` (0 = the first retry). The backoff is
 * min(4 s, 500 ms * 2^attempt) with jitter in [50%, 100%]. A Retry-After above
 * 10 s returns null (do not retry); otherwise its delay gets +0..25% jitter and
 * is never shorter than the backoff, so "0" or a past date does not hammer.
 */
export function retryDelayMs(attempt: number, retryAfterHeader: string | null, random: () => number = Math.random): number | null {
  const backoff = Math.min(MAX_BACKOFF_MS, BASE_DELAY_MS * 2 ** attempt) * (0.5 + random() / 2)
  const after = retryAfterMs(retryAfterHeader)
  if (after === null) return backoff
  if (after > MAX_RETRY_AFTER_MS) return null
  return Math.max(backoff, after * (1 + random() / 4))
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted.", "AbortError")
}

/** setTimeout as a promise; an abort rejects at once with the signal's reason. */
function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortReason(signal)); return }
    const onAbort = () => { clearTimeout(timer); reject(abortReason(signal as AbortSignal)) }
    const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve() }, ms)
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

function isOverloadStatus(status: number, hasRetryAfter: boolean): boolean {
  return OVERLOAD_STATUSES.includes(status) && (status !== 503 || hasRetryAfter)
}

/**
 * The server shed the request: a 429, or a 503 with Retry-After (the daemon's
 * overload answer). A 503 without it is a domain or edge "unavailable" error.
 */
export function isOverloadResponse(res: Response): boolean {
  return isOverloadStatus(res.status, res.headers.has("Retry-After"))
}

export type OverloadRetryOptions = {
  method: string
  signal?: AbortSignal | null
  /** Total tries including the first one (default 4). */
  maxAttempts?: number
  sleep?: (ms: number, signal?: AbortSignal | null) => Promise<void>
}

/**
 * Runs `doFetch` and, for a GET or HEAD with an overload answer, tries again after
 * retryDelayMs. Mutations are never repeated. Returns the last Response (the
 * caller handles it as before); an abort during the wait rejects with the
 * AbortError and no further request is sent.
 */
export async function fetchWithOverloadRetry(doFetch: () => Promise<Response>, opts: OverloadRetryOptions): Promise<Response> {
  const method = opts.method.toUpperCase()
  const retryable = method === "GET" || method === "HEAD"
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const wait = opts.sleep ?? sleep
  for (let attempt = 0; ; attempt++) {
    const res = await doFetch()
    if (!retryable || attempt + 1 >= maxAttempts || !isOverloadResponse(res)) return res
    const delay = retryDelayMs(attempt, res.headers.get("Retry-After"))
    if (delay === null) return res
    // Release the connection held by the unread body of the discarded answer.
    res.body?.cancel().catch(() => undefined)
    await wait(delay, opts.signal)
  }
}

/**
 * An API error the user can simply repeat in a moment: a 429, or a 503 whose
 * response had Retry-After (see the port contract above for the fields).
 */
export function isOverloadError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const { status, retryAfter, retryAfterSeconds } = err as { status?: unknown; retryAfter?: unknown; retryAfterSeconds?: unknown }
  return typeof status === "number" && isOverloadStatus(status, retryAfter != null || retryAfterSeconds != null)
}
