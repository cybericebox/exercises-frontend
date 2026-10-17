import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/api/client"
import { isBackendUnreachable, isUnreachableResponse, probeService, reportServiceAvailable } from "./serviceStatus"

afterEach(() => {
  vi.unstubAllGlobals()
  reportServiceAvailable()
})

describe("isUnreachableResponse", () => {
  it("counts a proxy 502/503/504 without X-Request-ID and without Retry-After", () => {
    for (const status of [502, 503, 504]) expect(isUnreachableResponse(status, null, null)).toBe(true)
  })

  it("never counts an overload answer: a 503 with Retry-After", () => {
    expect(isUnreachableResponse(503, null, "1")).toBe(false)
    expect(isUnreachableResponse(503, undefined, "0")).toBe(false)
  })
})

describe("isBackendUnreachable", () => {
  it("is false for an overload 503 error without X-Request-ID, true for a bare 503", () => {
    expect(isBackendUnreachable(new ApiError(503, null, undefined, undefined, undefined, 1))).toBe(false)
    expect(isBackendUnreachable(new ApiError(503, null))).toBe(true)
  })
})

describe("probeService", () => {
  it("an overload 503 with Retry-After and no X-Request-ID means the backend is up", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503, headers: { "Retry-After": "1" } })))
    await expect(probeService("https://api.test")).resolves.toBe(true)
  })

  it("a bare 503 is still down", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })))
    await expect(probeService("https://api.test")).resolves.toBe(false)
  })
})
