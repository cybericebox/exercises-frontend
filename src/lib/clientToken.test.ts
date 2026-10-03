import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ensureClientToken, fetchWithClientToken, resetClientTokenForTests } from "@/lib/clientToken"
import { STORAGE_CLIENT_TOKEN_EXPIRES } from "@/lib/storageKeys"

const future = (ms: number) => new Date(Date.now() + ms).toISOString()
const tokenOk = (ms = 3_600_000) =>
  new Response(JSON.stringify({ Status: {}, Data: { ExpiresAt: future(ms) } }), { status: 200, headers: { "content-type": "application/json" } })

describe("client token", () => {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()
  const tokenCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/api/client-token"))

  beforeEach(() => {
    resetClientTokenForTests()
    localStorage.clear()
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    vi.stubEnv("NEXT_PUBLIC_DOS_PROTECTION", "on")
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("DOS off: no request at all", async () => {
    vi.stubEnv("NEXT_PUBLIC_DOS_PROTECTION", "off")
    const send = vi.fn().mockResolvedValue(new Response("{}"))
    await fetchWithClientToken(send)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledTimes(1)
  })

  it("fetches the token once for parallel calls and sends the bot-check token in RecaptchaToken", async () => {
    fetchMock.mockImplementation(async () => tokenOk())
    const send = vi.fn().mockResolvedValue(new Response("{}"))
    await Promise.all([fetchWithClientToken(send), fetchWithClientToken(send), fetchWithClientToken(send)])
    expect(tokenCalls()).toHaveLength(1)
    const [, init] = tokenCalls()[0]
    expect(init?.credentials).toBe("include")
    expect(init?.method).toBe("POST")
    expect(JSON.parse(String(init?.body))).toEqual({ RecaptchaToken: "none" })
    expect(send).toHaveBeenCalledTimes(3)
    expect(localStorage.getItem(STORAGE_CLIENT_TOKEN_EXPIRES)).not.toBeNull()
    // fresh: no second request
    await ensureClientToken()
    expect(tokenCalls()).toHaveLength(1)
  })

  it("refreshes after expiry (1 minute margin)", async () => {
    fetchMock.mockImplementation(async () => tokenOk(30_000)) // inside the margin: already stale
    await ensureClientToken()
    await ensureClientToken()
    expect(tokenCalls()).toHaveLength(2)
  })

  it("429 + X-Client-Token: required refreshes the token and retries once", async () => {
    fetchMock.mockImplementation(async () => tokenOk())
    const send = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "X-Client-Token": "required" } }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
    const res = await fetchWithClientToken(send)
    expect(res.status).toBe(200)
    expect(send).toHaveBeenCalledTimes(2)
    expect(tokenCalls()).toHaveLength(2) // first visit + forced refresh
  })

  it("retries only once even if the retry is 429 again", async () => {
    fetchMock.mockImplementation(async () => tokenOk())
    const send = vi.fn().mockImplementation(async () => new Response("{}", { status: 429, headers: { "X-Client-Token": "required" } }))
    const res = await fetchWithClientToken(send)
    expect(res.status).toBe(429)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it("a plain 429 is an ordinary rate limit: no refresh, no retry", async () => {
    fetchMock.mockImplementation(async () => tokenOk())
    const send = vi.fn().mockResolvedValue(new Response("{}", { status: 429 }))
    const res = await fetchWithClientToken(send)
    expect(res.status).toBe(429)
    expect(send).toHaveBeenCalledTimes(1)
    expect(tokenCalls()).toHaveLength(1)
  })

  it("404 from the token endpoint means the backend has DOS off: remembered, no more requests", async () => {
    fetchMock.mockImplementation(async () => new Response("", { status: 404 }))
    const send = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }))
    await fetchWithClientToken(send)
    await fetchWithClientToken(send)
    expect(tokenCalls()).toHaveLength(1)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it("a failing token endpoint does not block the request and backs off before the next try", async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(async () => new Response("", { status: 429, headers: { "Retry-After": "20" } }))
    const send = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }))
    await fetchWithClientToken(send)
    await fetchWithClientToken(send)
    expect(send).toHaveBeenCalledTimes(2)
    expect(tokenCalls()).toHaveLength(1) // still backing off
    vi.advanceTimersByTime(21_000)
    await fetchWithClientToken(send)
    expect(tokenCalls()).toHaveLength(2)
  })

  it("a network error on the token endpoint never throws", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"))
    await expect(ensureClientToken()).resolves.toBe(false)
  })
})
