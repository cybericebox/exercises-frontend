import { afterEach, describe, expect, it, vi } from "vitest"
import { idOrigin } from "@/lib/origins"
import { apiGet, ApiError } from "./client"

const replace = vi.fn()

function answer(status: number, code: number, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify({ Status: { Code: code, Message: "x" } }), {
    status,
    headers: { "content-type": "application/json", ...headers },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  replace.mockReset()
})

describe("second-factor enrolment redirect", () => {
  it("sends a 403 with code 63812 to the ID second-factor page and never settles", async () => {
    vi.stubGlobal("location", { href: "http://exercises.localhost:3001/users?tab=a", replace })
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer(403, 63812)))

    const settled = vi.fn()
    void apiGet("/api/users").then(settled, settled)
    await vi.waitFor(() => expect(replace).toHaveBeenCalledOnce())

    const target = new URL(replace.mock.calls[0][0] as string)
    expect(target.origin).toBe(idOrigin)
    expect(target.pathname).toBe("/second-factor/")
    expect(target.searchParams.get("return_to")).toBe("https://exercises.localhost/users?tab=a")
    expect(settled).not.toHaveBeenCalled()
  })

  it("leaves other 403 answers as an ApiError", async () => {
    vi.stubGlobal("location", { href: "https://exercises.localhost/", replace })
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer(403, 60001)))

    await expect(apiGet("/api/users")).rejects.toBeInstanceOf(ApiError)
    expect(replace).not.toHaveBeenCalled()
  })
})
