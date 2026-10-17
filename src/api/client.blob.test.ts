import { afterEach, describe, expect, it, vi } from "vitest"
import { apiOrigin } from "@/lib/origins"
import { ApiError, apiKeepalive, apiGetBlob, apiPostBlob, filenameFromContentDisposition } from "./client"

afterEach(() => { vi.unstubAllGlobals() })

describe("filenameFromContentDisposition", () => {
  it("reads plain, quoted and RFC 5987 file names", () => {
    expect(filenameFromContentDisposition("attachment; filename=web-101.cybericebox.zip")).toBe("web-101.cybericebox.zip")
    expect(filenameFromContentDisposition('attachment; filename="a b.zip"')).toBe("a b.zip")
    expect(filenameFromContentDisposition("attachment; filename*=UTF-8''%D0%B0.zip")).toBe("а.zip")
    expect(filenameFromContentDisposition("attachment")).toBeNull()
    expect(filenameFromContentDisposition(null)).toBeNull()
  })
})

describe("apiPostBlob", () => {
  it("posts JSON with credentials and returns the body with its file name", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("zip", {
      status: 200,
      headers: { "Content-Disposition": "attachment; filename=x.cybericebox.zip", "Content-Type": "application/zip" },
    }))
    vi.stubGlobal("fetch", fetchMock)
    const result = await apiPostBlob("/api/exercises/export", { IDs: ["e1"] })
    expect(result.filename).toBe("x.cybericebox.zip")
    expect(result.blob.size).toBe(3)
    expect(fetchMock).toHaveBeenCalledWith(`${apiOrigin}/api/exercises/export`, expect.objectContaining({
      method: "POST", credentials: "include", body: JSON.stringify({ IDs: ["e1"] }),
    }))
  })

  it("throws ApiError with the envelope code when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ Status: { Code: 20000, Message: "bad" } }), {
      status: 400, headers: { "Content-Type": "application/json" },
    })))
    const error = await apiPostBlob("/api/exercises/export", {}).catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe(20000)
  })
})

describe("apiGetBlob", () => {
  it("apiGetBlob returns blob and filename; a 403 throws ApiError", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("zip", {
      status: 200,
      headers: { "Content-Disposition": "attachment; filename=example-task.cybericebox.zip", "Content-Type": "application/zip" },
    })).mockResolvedValueOnce(new Response(JSON.stringify({ Status: { Code: 60000 } }), {
      status: 403, headers: { "Content-Type": "application/json" },
    }))
    vi.stubGlobal("fetch", fetchMock)
    const result = await apiGetBlob("/api/exercises/import/example")
    expect(result.filename).toBe("example-task.cybericebox.zip")
    expect(result.blob.size).toBe(3)
    expect(fetchMock).toHaveBeenCalledWith(`${apiOrigin}/api/exercises/import/example`, expect.objectContaining({ method: "GET", credentials: "include" }))
    const error = await apiGetBlob("/api/exercises/import/example").catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(403)
  })
})

describe("apiKeepalive", () => {
  it("sends a keepalive request with credentials", () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    expect(apiKeepalive("PUT", "/api/exercises/e1/draft", { AdminNote: "" })).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(`${apiOrigin}/api/exercises/e1/draft`, expect.objectContaining({
      method: "PUT", keepalive: true, credentials: "include",
    }))
  })

  it("refuses bodies above the browser keepalive limit", () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    expect(apiKeepalive("PUT", "/x", { big: "x".repeat(70_000) })).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
