import { afterEach, describe, expect, it, vi } from "vitest"
import { apiGet, apiPost, ApiError } from "./client"
import { isServiceDown, reportServiceAvailable } from "@/lib/serviceStatus"

afterEach(() => {
  vi.unstubAllGlobals()
  reportServiceAvailable()
})

describe("API outage detection", () => {
  it.each([500, 501, 502, 503, 504, 599])("keeps the admin page on HTTP %i", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status })))
    await expect(apiGet("/api/auth/me", undefined, { required: false })).rejects.toBeInstanceOf(ApiError)
    expect(isServiceDown()).toBe(true)
    reportServiceAvailable()
  })

  it("shows the outage state on a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network failed")))
    await expect(apiGet("/api/auth/me", undefined, { required: false })).rejects.toBeInstanceOf(TypeError)
    expect(isServiceDown()).toBe(true)
  })

  it("does not report an outage when the caller aborted the request", async () => {
    const controller = new AbortController()
    controller.abort()
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")))
    await expect(apiPost("/api/x", {}, { signal: controller.signal })).rejects.toThrow("aborted")
    expect(isServiceDown()).toBe(false)
  })
})
