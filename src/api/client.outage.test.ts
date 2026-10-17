import { afterEach, describe, expect, it, vi } from "vitest"
import { apiGet, apiGetBlob, apiPost, ApiError } from "./client"
import { isServiceDown, reportServiceAvailable } from "@/lib/serviceStatus"
import { isOverloadError } from "./retry"

afterEach(() => {
  vi.unstubAllGlobals()
  reportServiceAvailable()
})

const overload = () => new Response("", { status: 503, headers: { "Retry-After": "1" } })

describe("API overload retry", () => {
  it("does not report an outage on a 503 that a retry recovers from", async () => {
    vi.useFakeTimers()
    try {
      const fetchMock = vi.fn().mockImplementationOnce(async () => overload()).mockImplementation(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }))
      vi.stubGlobal("fetch", fetchMock)
      const pending = apiGet("/api/x")
      await vi.advanceTimersByTimeAsync(5000)
      await pending
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(isServiceDown()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it("reports the outage only on the final 503, after the retries", async () => {
    vi.useFakeTimers()
    try {
      const fetchMock = vi.fn().mockImplementation(async () => overload())
      vi.stubGlobal("fetch", fetchMock)
      const pending = apiGet("/api/x").catch((e: unknown) => e)
      await vi.advanceTimersByTimeAsync(30_000)
      expect(await pending).toBeInstanceOf(ApiError)
      expect(fetchMock).toHaveBeenCalledTimes(4)
      expect(isServiceDown()).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it("does not retry a mutation, a bare 503 or retry: false", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => overload())
    vi.stubGlobal("fetch", fetchMock)
    await expect(apiPost("/api/x", {})).rejects.toBeInstanceOf(ApiError)
    await expect(apiGet("/api/x", undefined, { retry: false })).rejects.toBeInstanceOf(ApiError)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    fetchMock.mockClear()
    fetchMock.mockImplementation(async () => new Response("", { status: 503 }))
    await expect(apiGet("/api/x")).rejects.toBeInstanceOf(ApiError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each(["1", "0", new Date(Date.now() - 60_000).toUTCString()])("keeps Retry-After %s on the error so it is an overload error", async (header) => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response("", { status: 503, headers: { "Retry-After": header } })))
    const error = await apiGet("/api/x", undefined, { retry: false }).catch((e: unknown) => e)
    expect(isOverloadError(error)).toBe(true)
  })
})

describe("API outage detection", () => {
  it("a silent blob request does not report an outage on a dropped connection or a proxy 502", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network failed")))
    await expect(apiGetBlob("/api/x", { silentOutage: true })).rejects.toBeInstanceOf(TypeError)
    expect(isServiceDown()).toBe(false)
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response("", { status: 502 })))
    await expect(apiGetBlob("/api/x", { silentOutage: true })).rejects.toBeInstanceOf(ApiError)
    expect(isServiceDown()).toBe(false)
    await expect(apiGetBlob("/api/x")).rejects.toBeInstanceOf(ApiError)
    expect(isServiceDown()).toBe(true)
  })

  it("a silent JSON request does not report an outage on a dropped connection or a proxy 502", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network failed")))
    await expect(apiGet("/api/x", undefined, { silentOutage: true })).rejects.toBeInstanceOf(TypeError)
    expect(isServiceDown()).toBe(false)
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response("", { status: 502 })))
    await expect(apiGet("/api/x", undefined, { silentOutage: true })).rejects.toBeInstanceOf(ApiError)
    expect(isServiceDown()).toBe(false)
  })

  it.each([502, 503, 504])("reports an outage on a proxy HTTP %i without X-Request-ID", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status })))
    await expect(apiGet("/api/auth/me", undefined, { required: false })).rejects.toBeInstanceOf(ApiError)
    expect(isServiceDown()).toBe(true)
  })

  it.each([500, 501, 502, 503, 504, 599])("a backend HTTP %i with X-Request-ID is a real error, not an outage", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status, headers: { "X-Request-ID": "01a112da-1" } })))
    await expect(apiGet("/api/x", undefined, { required: false })).rejects.toBeInstanceOf(ApiError)
    expect(isServiceDown()).toBe(false)
  })

  it.each([500, 501, 599])("a bare HTTP %i is not an outage", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status })))
    await expect(apiGet("/api/x", undefined, { required: false })).rejects.toBeInstanceOf(ApiError)
    expect(isServiceDown()).toBe(false)
  })

  it("shows the outage state on a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network failed")))
    await expect(apiGet("/api/auth/me", undefined, { required: false })).rejects.toBeInstanceOf(TypeError)
    expect(isServiceDown()).toBe(true)
  })

  it.each([400, 401, 403, 404, 429])("does not report an outage on HTTP %i", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response("", { status })))
    await expect(apiGet("/api/x", undefined, { required: false, retry: false })).rejects.toBeInstanceOf(ApiError)
    expect(isServiceDown()).toBe(false)
  })

  it("does not report an outage when the request timed out", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")))
    await expect(apiGet("/api/x", undefined, { required: false })).rejects.toThrow("timeout")
    expect(isServiceDown()).toBe(false)
  })

  it("does not report an outage when the caller aborted the request", async () => {
    const controller = new AbortController()
    controller.abort()
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")))
    await expect(apiPost("/api/x", {}, { signal: controller.signal })).rejects.toThrow("aborted")
    expect(isServiceDown()).toBe(false)
  })
})
