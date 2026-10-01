/**
 * client.multipart.test.ts — apiPostMultipart (Task 9).
 *
 * NOT via apiPost: request() in client.ts always sets Content-Type:
 * application/json, which breaks the multipart boundary. apiPostMultipart
 * shares request()'s 401-redirect / envelope-unwrap / error conventions
 * without forcing that header (see api/exercises/files.ts for the XHR
 * progress-reporting variant used where upload progress is needed).
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { apiOrigin } from "@/lib/origins"
import { apiPostMultipart, ApiError } from "./client"
import { isServiceDown, reportServiceAvailable } from "@/lib/serviceStatus"

afterEach(() => {
  vi.unstubAllGlobals()
  reportServiceAvailable()
})

describe("apiPostMultipart", () => {
  it("POSTs the FormData body with credentials included and no forced JSON header", async () => {
    const form = new FormData()
    form.append("file", new File(["x"], "logo.png"))
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ Status: { Code: 10000, Message: "Success" }, Data: { FileID: "f1", Url: "/api/x/f1" } }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await apiPostMultipart("/api/notifications/templates/email/images", form)

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${apiOrigin}/api/notifications/templates/email/images`)
    expect(init.method).toBe("POST")
    expect(init.credentials).toBe("include")
    expect(init.body).toBe(form)
    expect(result).toEqual({ FileID: "f1", Url: "/api/x/f1" })
  })

  it("throws ApiError with the envelope status and code on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ Status: { Code: 21099, Message: "Invalid image" } }), {
          status: 400,
          headers: { "content-type": "application/json" },
        })
      )
    )
    await expect(apiPostMultipart("/api/x", new FormData())).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).status).toBe(400)
      expect((error as ApiError).code).toBe(21099)
      return true
    })
  })

  it("redirects to sign-in on 401 when required (default) instead of resolving", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 401, headers: { "X-Sign-In-URL": "https://id.example/sign-in" } }))
    )
    const replace = vi.fn()
    vi.stubGlobal("window", {
      location: { href: "https://admin.example/x", origin: "https://admin.example", replace },
    })
    const setCookie = vi.spyOn(document, "cookie", "set")
    const settled = vi.fn()
    void apiPostMultipart("/api/x", new FormData()).then(settled, settled)
    await Promise.resolve()
    await Promise.resolve()
    expect(setCookie).toHaveBeenCalledWith(expect.stringContaining("cib_return_to="))
    expect(replace).toHaveBeenCalledWith("https://id.example/sign-in")
    expect(settled).not.toHaveBeenCalled()
  })

  it("reports the outage state on a 5xx response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })))
    await expect(apiPostMultipart("/api/x", new FormData())).rejects.toBeInstanceOf(ApiError)
    expect(isServiceDown()).toBe(true)
  })

  it("reports the outage state on a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network failed")))
    await expect(apiPostMultipart("/api/x", new FormData())).rejects.toBeInstanceOf(TypeError)
    expect(isServiceDown()).toBe(true)
  })
})
