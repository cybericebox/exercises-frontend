// The profile's back arrow: admin, event and catalog sources get a destination tooltip; the
// landing and unknown sources keep the plain «Назад» (no destination).
import { describe, expect, it, vi } from "vitest"
import { backLabel } from "./backLink"
import { resolveIdBack } from "./useBackLink"

vi.mock("@/lib/origins", () => ({
  mainHost: "cybericebox.local",
  eventDomain: "cybericebox.local",
  idOrigin: "https://id.cybericebox.local",
  adminOrigin: "https://admin.cybericebox.local",
  exercisesOrigin: "https://exercises.cybericebox.local",
  apiOrigin: "https://api.cybericebox.local",
}))

const ID = "id.cybericebox.local"
function memoryStorage() {
  const data = new Map<string, string>()
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) } as unknown as Storage
}
const key = (returnTo: string | null, referrer = "", storage = memoryStorage()) => backLabel(resolveIdBack(returnTo, referrer, ID, storage))

describe("profile back arrow", () => {
  it("names admin, event and catalog destinations", () => {
    expect(resolveIdBack("https://admin.cybericebox.local/users", "", ID, null)).toEqual({ kind: "admin", href: "https://admin.cybericebox.local/users" })
    expect(key("https://admin.cybericebox.local/users")).toBe("back.toAdmin")
    expect(key("https://ctf.cybericebox.local/")).toBe("back.toEvent")
    expect(key("https://exercises.cybericebox.local/detail?id=1")).toBe("back.toCatalog")
  })

  it("falls back to another app's referrer and keeps it for the tab", () => {
    const storage = memoryStorage()
    expect(key(null, "https://admin.cybericebox.local/events", storage)).toBe("back.toAdmin")
    expect(key(null, "https://id.cybericebox.local/profile", storage)).toBe("back.toAdmin")
  })

  it("keeps the plain back for the landing and unknown sources", () => {
    expect(resolveIdBack("https://cybericebox.local/", "", ID, null)?.kind).toBe("landing")
    expect(key("https://cybericebox.local/")).toBeNull()
    expect(resolveIdBack("https://evil.com/", "", ID, null)).toBeNull()
    expect(resolveIdBack(null, "https://id.cybericebox.local/sign-in", ID, null)).toBeNull()
  })
})
