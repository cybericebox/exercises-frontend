import { describe, expect, it } from "vitest"
import { accountLinks, accountMenu, catalogAllowed, type AccountApp } from "./accountMenu"

const origins = {
  id: "https://id.cybericebox.local",
  admin: "https://admin.cybericebox.local",
  exercises: "https://exercises.cybericebox.local",
  main: "https://cybericebox.local",
}
const everyone = { adminTier: true, catalog: true, returnTo: "https://x.cybericebox.local/a?b=1" }
const keys = (app: AccountApp, opts = everyone) => accountLinks(app, opts, origins).map((link) => link.key)

describe("account menu", () => {
  it("keeps one order and hides the current app", () => {
    expect(keys("event")).toEqual(["profile", "main", "admin", "exercises"])
    expect(keys("main")).toEqual(["profile", "admin", "exercises"])
    expect(keys("id")).toEqual(["main", "admin", "exercises"])
    expect(keys("admin")).toEqual(["profile", "main", "exercises"])
    expect(keys("exercises")).toEqual(["profile", "main", "admin"])
  })

  it("ends with a divider, the cookie settings, a divider and sign-out", () => {
    const menu = accountMenu("admin", everyone, origins).map((entry) => (entry.kind === "link" ? entry.key : entry.kind))
    expect(menu).toEqual(["profile", "main", "exercises", "divider", "cookies", "divider", "signOut"])
  })

  it("shows admin and catalog links only to allowed users", () => {
    expect(keys("event", { ...everyone, adminTier: false, catalog: false })).toEqual(["profile", "main"])
    expect(keys("event", { ...everyone, adminTier: false })).toEqual(["profile", "main", "exercises"])
  })

  it("sends the profile link back to the current page", () => {
    const profile = accountLinks("event", everyone, origins)[0]
    expect(profile.href).toBe(`https://id.cybericebox.local/profile?return_to=${encodeURIComponent(everyone.returnTo)}`)
  })

  it("opens the catalog to admins and event staff", () => {
    expect(catalogAllowed(null)).toBe(false)
    expect(catalogAllowed({ IsAdmin: false, Events: [] })).toBe(false)
    expect(catalogAllowed({ IsAdmin: true, Events: null })).toBe(true)
    expect(catalogAllowed({ IsAdmin: false, Events: [{ ID: "e" }] })).toBe(true)
  })
})
