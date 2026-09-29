import { describe, expect, it, vi } from "vitest"

describe("signInURL", () => {
  it("points at the ID app and never nests a sign-in return_to", async () => {
    vi.stubEnv("NEXT_PUBLIC_DOMAIN", "cybericebox-dev.pp.ua")
    vi.resetModules()
    const { signInURL } = await import("./origins")
    const url = new URL(signInURL("https://exercises.cybericebox-dev.pp.ua/sign-in?return_to=x"))
    expect(url.origin).toBe("https://id.cybericebox-dev.pp.ua")
    expect(url.pathname).toBe("/sign-in")
    expect(url.searchParams.get("return_to")).toBe("https://exercises.cybericebox-dev.pp.ua/")
    vi.unstubAllEnvs()
  })

  it("returns empty instead of a same-origin /sign-in when the domain is unknown", async () => {
    vi.stubEnv("NEXT_PUBLIC_DOMAIN", "")
    vi.resetModules()
    const { signInURL } = await import("./origins")
    expect(signInURL("https://exercises.example/")).toBe("")
    vi.unstubAllEnvs()
  })
})
