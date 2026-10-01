import { describe, expect, it } from "vitest"
import { backHosts, backLabel, classifyBack, resolveBack } from "./backLink"

const hosts = backHosts({ main: "cybericebox.local", eventDomain: "cybericebox.local" }, {
  admin: "https://admin.cybericebox.local",
  exercises: "https://exercises.cybericebox.local",
  id: "https://id.cybericebox.local",
  api: "https://api.cybericebox.local",
})

function memoryStorage() {
  const data = new Map<string, string>()
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
}

describe("back link", () => {
  it("tells each platform app apart", () => {
    expect(classifyBack("https://admin.cybericebox.local/events/1", hosts)).toEqual({ kind: "admin", href: "https://admin.cybericebox.local/events/1" })
    expect(classifyBack("https://ctf.cybericebox.local/manage?x=1", hosts)?.kind).toBe("event")
    expect(classifyBack("https://exercises.cybericebox.local/detail?id=1", hosts)?.kind).toBe("catalog")
    expect(classifyBack("https://cybericebox.local/", hosts)?.kind).toBe("landing")
  })

  it("rejects foreign, insecure and service URLs", () => {
    for (const value of [
      "https://evil.com/", "https://cybericebox.local.evil.com/", "http://admin.cybericebox.local/",
      "javascript:alert(1)", "https://user:pw@admin.cybericebox.local/", "https://a.b.cybericebox.local/",
      "https://id.cybericebox.local/profile", "https://api.cybericebox.local/", "/relative", "", null,
    ]) expect(classifyBack(value, hosts), String(value)).toBeNull()
    expect(classifyBack("https://admin.cybericebox.local/", backHosts({ main: "", eventDomain: "" }, { admin: "", exercises: "", id: "", api: "" }))).toBeNull()
  })

  it("drops the port", () => {
    expect(classifyBack("https://admin.cybericebox.local:3002/x", hosts)?.href).toBe("https://admin.cybericebox.local/x")
  })

  it("prefers return_to, then another app's referrer, then the tab's stored source", () => {
    const storage = memoryStorage()
    const here = "exercises.cybericebox.local"
    const first = resolveBack({ returnTo: "https://ctf.cybericebox.local/manage", referrer: "https://admin.cybericebox.local/", currentHost: here }, hosts, storage)
    expect(first?.kind).toBe("event")
    // In-app navigation: no return_to, the referrer is the catalog itself → the stored source.
    expect(resolveBack({ returnTo: null, referrer: "https://exercises.cybericebox.local/", currentHost: here }, hosts, storage)?.href).toBe("https://ctf.cybericebox.local/manage")
    // A new app referrer replaces it.
    expect(resolveBack({ returnTo: null, referrer: "https://admin.cybericebox.local/users", currentHost: here }, hosts, storage)?.kind).toBe("admin")
    expect(resolveBack({ returnTo: "https://evil.com/", referrer: "", currentHost: here }, hosts, storage)?.kind).toBe("admin")
    expect(resolveBack({ returnTo: null, referrer: "", currentHost: here }, hosts, memoryStorage())).toBeNull()
  })

  it("works without storage", () => {
    const broken = { getItem: () => { throw new Error("denied") }, setItem: () => { throw new Error("denied") } }
    expect(resolveBack({ returnTo: "https://admin.cybericebox.local/", referrer: "", currentHost: "x" }, hosts, broken)?.kind).toBe("admin")
    expect(resolveBack({ returnTo: null, referrer: "", currentHost: "x" }, hosts, broken)).toBeNull()
  })

  it("gives a destination tooltip only for admin, event and catalog sources", () => {
    expect(backLabel({ kind: "admin", href: "" })).toBe("back.toAdmin")
    expect(backLabel({ kind: "event", href: "" })).toBe("back.toEvent")
    expect(backLabel({ kind: "catalog", href: "" })).toBe("back.toCatalog")
    expect(backLabel({ kind: "landing", href: "" })).toBeNull()
    expect(backLabel(null)).toBeNull()
  })
})
