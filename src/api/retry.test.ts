import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fetchWithOverloadRetry, isOverloadError, isOverloadResponse, parseRetryAfterSeconds, retryDelayMs } from "./retry"

const answer = (status: number, headers: Record<string, string> = {}) => new Response(status === 200 ? "ok" : "", { status, headers })
/** The daemon's overload answer: 503 with Retry-After. */
const overloaded = () => answer(503, { "Retry-After": "1" })

/** A doFetch mock that answers with `statuses` in order (the last one repeats); 503 means the overload 503. */
function answers(...statuses: Array<number | Response>) {
  let call = 0
  return vi.fn(async () => {
    const next = statuses[Math.min(call++, statuses.length - 1)]
    if (typeof next !== "number") return next
    return next === 503 ? overloaded() : answer(next)
  })
}

/** An error shaped like any client's API error (status + optional Retry-After field and error code). */
const apiError = (status: number, fields: { retryAfter?: number; retryAfterSeconds?: number; code?: number } = {}) => Object.assign(new Error(`API error ${status}`), { status, ...fields })

// No jitter by default, so delays are exact; tests that need jitter pass `random`.
beforeEach(() => { vi.useFakeTimers(); vi.spyOn(Math, "random").mockReturnValue(0) })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe("retryDelayMs", () => {
  it("backs off exponentially with jitter, capped at 4 s", () => {
    expect(retryDelayMs(0, null, () => 1)).toBe(500)
    expect(retryDelayMs(0, null, () => 0)).toBe(250)
    expect(retryDelayMs(2, null, () => 1)).toBe(2000)
    expect(retryDelayMs(5, null, () => 1)).toBe(4000)
  })

  it("takes Retry-After seconds and refuses waits above 10 s", () => {
    expect(retryDelayMs(0, "2", () => 0)).toBe(2000)
    expect(retryDelayMs(0, "10", () => 0)).toBe(10_000)
    expect(retryDelayMs(0, "30", () => 0)).toBeNull()
    // 10 s is checked on the raw value, before jitter.
    expect(retryDelayMs(0, "11", () => 0)).toBeNull()
  })

  it("adds up to 25% jitter to a Retry-After delay", () => {
    expect(retryDelayMs(0, "2", () => 1)).toBe(2500)
    expect(retryDelayMs(0, "10", () => 1)).toBe(12_500)
  })

  it("takes a Retry-After HTTP-date", () => {
    vi.setSystemTime(new Date("2026-10-18T12:00:00Z"))
    expect(retryDelayMs(0, "Sun, 18 Oct 2026 12:00:03 GMT", () => 0)).toBe(3000)
    expect(retryDelayMs(0, "Sun, 18 Oct 2026 12:01:00 GMT", () => 0)).toBeNull()
  })

  it("never retries sooner than the backoff, even for Retry-After 0 or a past date", () => {
    vi.setSystemTime(new Date("2026-10-18T12:00:00Z"))
    expect(retryDelayMs(0, "0", () => 0)).toBe(250)
    expect(retryDelayMs(2, "0", () => 1)).toBe(2000)
    expect(retryDelayMs(1, "Sun, 18 Oct 2026 11:59:00 GMT", () => 0)).toBe(500)
    expect(retryDelayMs(3, "1", () => 0)).toBe(2000)
  })

  it("falls back to backoff on an unparseable Retry-After, numeric junk included", () => {
    expect(retryDelayMs(1, "soon", () => 1)).toBe(1000)
    expect(retryDelayMs(1, "-1", () => 1)).toBe(1000)
    expect(retryDelayMs(1, "+1", () => 1)).toBe(1000)
    expect(retryDelayMs(1, "1,5", () => 1)).toBe(1000)
  })
})

describe("parseRetryAfterSeconds", () => {
  it("gives whole seconds for delta-seconds and HTTP-dates, 0 included", () => {
    vi.setSystemTime(new Date("2026-10-18T12:00:00Z"))
    expect(parseRetryAfterSeconds("1")).toBe(1)
    expect(parseRetryAfterSeconds("1.2")).toBe(2)
    expect(parseRetryAfterSeconds("0")).toBe(0)
    expect(parseRetryAfterSeconds("Sun, 18 Oct 2026 12:00:03 GMT")).toBe(3)
    expect(parseRetryAfterSeconds("Sun, 18 Oct 2026 11:59:00 GMT")).toBe(0)
  })

  it("is undefined when absent or unparseable", () => {
    expect(parseRetryAfterSeconds(null)).toBeUndefined()
    expect(parseRetryAfterSeconds("")).toBeUndefined()
    expect(parseRetryAfterSeconds("-1")).toBeUndefined()
    expect(parseRetryAfterSeconds("soon")).toBeUndefined()
  })
})

describe("fetchWithOverloadRetry", () => {
  it("retries a GET 503 and returns the 200", async () => {
    const doFetch = answers(503, 200)
    const result = fetchWithOverloadRetry(doFetch, { method: "GET" })
    await vi.runAllTimersAsync()
    expect((await result).status).toBe(200)
    expect(doFetch).toHaveBeenCalledTimes(2)
  })

  it("retries a GET 429 too", async () => {
    const doFetch = answers(429, 200)
    const result = fetchWithOverloadRetry(doFetch, { method: "get" })
    await vi.runAllTimersAsync()
    expect((await result).status).toBe(200)
  })

  it("waits the Retry-After seconds before the next try", async () => {
    const doFetch = answers(answer(503, { "Retry-After": "2" }), 200)
    const result = fetchWithOverloadRetry(doFetch, { method: "GET" })
    await vi.advanceTimersByTimeAsync(1999)
    expect(doFetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(doFetch).toHaveBeenCalledTimes(2)
    expect((await result).status).toBe(200)
  })

  it("waits until a Retry-After HTTP-date", async () => {
    vi.setSystemTime(new Date("2026-10-18T12:00:00Z"))
    const doFetch = answers(answer(503, { "Retry-After": "Sun, 18 Oct 2026 12:00:03 GMT" }), 200)
    const result = fetchWithOverloadRetry(doFetch, { method: "GET" })
    await vi.advanceTimersByTimeAsync(2999)
    expect(doFetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect((await result).status).toBe(200)
  })

  it("does not retry when Retry-After is above 10 s", async () => {
    const doFetch = answers(answer(503, { "Retry-After": "30" }), 200)
    const result = await fetchWithOverloadRetry(doFetch, { method: "GET" })
    expect(result.status).toBe(503)
    expect(doFetch).toHaveBeenCalledTimes(1)
  })

  it.each(["POST", "PUT", "PATCH", "DELETE"])("never repeats a %s", async (method) => {
    const doFetch = answers(503, 200)
    const result = await fetchWithOverloadRetry(doFetch, { method })
    expect(result.status).toBe(503)
    expect(doFetch).toHaveBeenCalledTimes(1)
  })

  it.each([500, 502, 504, 404])("does not retry a GET %i", async (status) => {
    const doFetch = answers(status, 200)
    expect((await fetchWithOverloadRetry(doFetch, { method: "GET" })).status).toBe(status)
    expect(doFetch).toHaveBeenCalledTimes(1)
  })

  it("does not retry a GET 503 without Retry-After (a domain or edge error)", async () => {
    const doFetch = answers(answer(503), 200)
    const result = await fetchWithOverloadRetry(doFetch, { method: "GET" })
    expect(result.status).toBe(503)
    expect(doFetch).toHaveBeenCalledTimes(1)
  })

  it("gives up after 4 tries and returns the last 503", async () => {
    const last = overloaded()
    const doFetch = answers(503, 503, 503, last, 200)
    const result = fetchWithOverloadRetry(doFetch, { method: "GET" })
    await vi.runAllTimersAsync()
    expect(await result).toBe(last)
    expect(doFetch).toHaveBeenCalledTimes(4)
  })

  it("rejects with the AbortError when aborted during the wait and sends nothing more", async () => {
    const controller = new AbortController()
    const doFetch = answers(503, 200)
    const result = fetchWithOverloadRetry(doFetch, { method: "GET", signal: controller.signal })
    const settled = expect(result).rejects.toMatchObject({ name: "AbortError" })
    await vi.advanceTimersByTimeAsync(100)
    controller.abort()
    await settled
    await vi.runAllTimersAsync()
    expect(doFetch).toHaveBeenCalledTimes(1)
  })

  it("uses the given sleep", async () => {
    const sleep = vi.fn(async () => undefined)
    const doFetch = answers(answer(429, { "Retry-After": "1" }), 200)
    expect((await fetchWithOverloadRetry(doFetch, { method: "GET", sleep })).status).toBe(200)
    expect(sleep).toHaveBeenCalledWith(1000, undefined)
  })
})

describe("isOverloadResponse", () => {
  it("is a 429, or a 503 with Retry-After", () => {
    expect(isOverloadResponse(answer(429))).toBe(true)
    expect(isOverloadResponse(overloaded())).toBe(true)
    expect(isOverloadResponse(answer(503))).toBe(false)
    expect(isOverloadResponse(answer(502, { "Retry-After": "1" }))).toBe(false)
    expect(isOverloadResponse(answer(200))).toBe(false)
  })
})

describe("isOverloadError", () => {
  it("is a 503 that carried Retry-After (0 included), under either field name", () => {
    expect(isOverloadError(apiError(503, { retryAfter: 1 }))).toBe(true)
    expect(isOverloadError(apiError(503, { retryAfterSeconds: 1 }))).toBe(true)
    expect(isOverloadError(apiError(503, { retryAfter: 0 }))).toBe(true)
  })

  it("is an overload code (ServiceOverloaded 70431, DatabaseBusy 70432), full or as the detail code", () => {
    expect(isOverloadError(apiError(503, { code: 70431 }))).toBe(true)
    expect(isOverloadError(apiError(503, { code: 70432 }))).toBe(true)
    expect(isOverloadError(apiError(503, { code: 431 }))).toBe(true)
    expect(isOverloadError(apiError(503, { code: 432 }))).toBe(true)
  })

  it("is never a 429: a personal rate limit is not the server overload", () => {
    expect(isOverloadError(apiError(429))).toBe(false)
    expect(isOverloadError(apiError(429, { retryAfter: 30, code: 70428 }))).toBe(false)
    expect(isOverloadError(apiError(429, { retryAfterSeconds: 30, code: 428 }))).toBe(false)
  })

  it("is false for a 503 without Retry-After, other statuses, other codes and non-API errors", () => {
    expect(isOverloadError(apiError(503))).toBe(false)
    expect(isOverloadError(apiError(503, { code: 20225 }))).toBe(false)
    expect(isOverloadError(apiError(500, { retryAfter: 1 }))).toBe(false)
    expect(isOverloadError(new Error("503"))).toBe(false)
    expect(isOverloadError({ status: 503, retryAfter: 1 })).toBe(false)
    expect(isOverloadError(null)).toBe(false)
  })

  it("agrees with isOverloadResponse through parseRetryAfterSeconds", () => {
    for (const header of ["1", "0", "Sun, 18 Oct 2026 11:59:00 GMT"]) {
      const res = answer(503, { "Retry-After": header })
      expect(isOverloadResponse(res)).toBe(true)
      expect(isOverloadError(apiError(503, { retryAfter: parseRetryAfterSeconds(res.headers.get("Retry-After")) }))).toBe(true)
    }
  })
})
