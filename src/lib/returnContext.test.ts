import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/origins", () => ({ publicDomain: "cybericebox.local" }))

import { readStoredReturnContext, resolveEventId, resolveReturnContext, safeReturnUrl } from "./returnContext"

describe("safeReturnUrl", () => {
  it("accepts https URLs on the platform domain and its subdomains", () => {
    expect(safeReturnUrl("https://cybericebox.local/x")).toBe("https://cybericebox.local/x")
    expect(safeReturnUrl("https://ctf.events.cybericebox.local/a?b=1")).toBe("https://ctf.events.cybericebox.local/a?b=1")
  })

  it.each([
    "http://ctf.cybericebox.local/",
    "https://evil.com/",
    "https://cybericebox.local.evil.com/",
    "https://evilcybericebox.local/",
    "https://user:pass@ctf.cybericebox.local/",
    "javascript:alert(1)",
    "/relative",
    "",
  ])("rejects %s", (value) => {
    expect(safeReturnUrl(value)).toBeNull()
  })

  it("rejects everything without a configured domain", () => {
    expect(safeReturnUrl("https://cybericebox.local/", "")).toBeNull()
  })
})

describe("resolveReturnContext", () => {
  beforeEach(() => window.sessionStorage.clear())

  it("persists a valid return URL with its event", () => {
    const context = resolveReturnContext(new URLSearchParams("return=https://ctf.cybericebox.local/&event=ev-1"))
    expect(context).toEqual({ returnUrl: "https://ctf.cybericebox.local/", eventId: "ev-1" })
    expect(readStoredReturnContext()).toEqual(context)
    expect(resolveReturnContext(new URLSearchParams(""))).toEqual(context)
  })

  it("reads return_to before the older return", () => {
    const context = resolveReturnContext(new URLSearchParams("return_to=https://admin.cybericebox.local/events&return=https://ctf.cybericebox.local/"))
    expect(context.returnUrl).toBe("https://admin.cybericebox.local/events")
  })

  it("ignores an unsafe return URL and keeps the stored one", () => {
    resolveReturnContext(new URLSearchParams("return=https://ctf.cybericebox.local/"))
    const context = resolveReturnContext(new URLSearchParams("return=https://evil.com/&event=x"))
    expect(context).toEqual({ returnUrl: "https://ctf.cybericebox.local/", eventId: null })
  })

  it("survives disabled storage", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied") })
    expect(resolveReturnContext(new URLSearchParams("return=https://cybericebox.local/")).returnUrl).toBe("https://cybericebox.local/")
    spy.mockRestore()
  })

  it("drops a malformed stored value", () => {
    window.sessionStorage.setItem("cib_exercises_return", "{not json")
    expect(readStoredReturnContext()).toEqual({ returnUrl: null, eventId: null })
  })
})

describe("resolveEventId", () => {
  it("prefers an explicit ?event= over the stored context", () => {
    expect(resolveEventId(new URLSearchParams("event=ev-2"), { returnUrl: null, eventId: "ev-1" })).toBe("ev-2")
    expect(resolveEventId(new URLSearchParams(""), { returnUrl: null, eventId: "ev-1" })).toBe("ev-1")
    expect(resolveEventId(new URLSearchParams("event=bad id!"), { returnUrl: null, eventId: null })).toBeNull()
  })
})
