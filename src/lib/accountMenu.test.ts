import { describe, expect, it } from "vitest"
import { accountLinks, accountMenu, catalogAllowed, type AccountApp } from "./accountMenu"

const origins = {
  id: "https://id.cybericebox.local",
  admin: "https://admin.cybericebox.local",
  exercises: "https://exercises.cybericebox.local",
}
const everyone = { adminTier: true, catalog: true, returnTo: "https://x.cybericebox.local/a?b=1" }
const keys = (app: AccountApp, opts = everyone) => accountLinks(app, opts, origins).map((link) => link.key)

describe("account menu", () => {
  it("keeps one order and hides the current app", () => {
    expect(keys("event")).toEqual(["profile", "admin", "exercises"])
    expect(keys("main")).toEqual(["profile", "admin", "exercises"])
    expect(keys("id")).toEqual(["admin", "exercises"])
    expect(keys("admin")).toEqual(["profile", "exercises"])
    expect(keys("exercises")).toEqual(["profile", "admin"])
  })

  it("ends with a divider, the cookie settings, a divider and sign-out", () => {
    const menu = accountMenu("admin", everyone, origins).map((entry) => (entry.kind === "link" ? entry.key : entry.kind))
    expect(menu).toEqual(["profile", "exercises", "divider", "cookies", "divider", "signOut"])
  })

  it("shows admin and catalog links only to allowed users", () => {
    expect(keys("event", { ...everyone, adminTier: false, catalog: false })).toEqual(["profile"])
    expect(keys("event", { ...everyone, adminTier: false })).toEqual(["profile", "exercises"])
  })

  it("sends the profile and catalog links back to the current page", () => {
    const [profile, , catalog] = accountLinks("event", everyone, origins)
    expect(profile.href).toBe(`https://id.cybericebox.local/profile?return_to=${encodeURIComponent(everyone.returnTo)}`)
    expect(catalog.href).toBe(`https://exercises.cybericebox.local?return_to=${encodeURIComponent(everyone.returnTo)}`)
    expect(accountLinks("event", { ...everyone, returnTo: "" }, origins)[0].href).toBe("https://id.cybericebox.local/profile")
  })

  it("opens the catalog to admins and event staff", () => {
    expect(catalogAllowed(null)).toBe(false)
    expect(catalogAllowed({ IsAdmin: false, Events: [] })).toBe(false)
    expect(catalogAllowed({ IsAdmin: true, Events: null })).toBe(true)
    expect(catalogAllowed({ IsAdmin: false, Events: [{ ID: "e" }] })).toBe(true)
  })
})
