// Cookie consent (Google Consent Mode v2): denied by default; accept all / save choice
// map to analytics_storage only; the choice is one cookie on the parent domain.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as consent from "./consent"

// A cookie jar that records every write (jsdom rejects a foreign parent domain), and a gtag spy.
function fakeCookies() {
  const writes: string[] = []
  const jar = new Map<string, string>()
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
    set: (s: string) => {
      writes.push(s)
      const [k, v] = s.split("; ")[0].split("=")
      if (/max-age=0\b/.test(s)) jar.delete(k)
      else jar.set(k, v)
    },
  })
  return { writes, jar }
}

describe("consent", () => {
  const gtag = vi.fn()
  beforeEach(() => {
    gtag.mockReset()
    ;(window as unknown as { gtag: typeof gtag }).gtag = gtag
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    Reflect.deleteProperty(document, "cookie")
  })

  it("defaults every Consent Mode signal to denied, before config", () => {
    expect(consent.CONSENT_DEFAULTS).toEqual({
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    })
    const boot = consent.gtagBootScript("G-TEST")
    expect(boot.indexOf('"consent","default"')).toBeLessThan(boot.indexOf('"config"'))
    expect(boot).toContain('"ad_storage":"denied"')
  })

  it("the boot script grants analytics only for a stored analytics:granted", () => {
    const run = (cookie: string) => {
      const w = { dataLayer: [] as ArrayLike<unknown>[] }
      new Function("window", "document", "dataLayer", consent.gtagBootScript("G-TEST"))(w, { cookie }, w.dataLayer)
      return w.dataLayer.map((a) => Array.from(a)).filter((c) => c[0] === "consent").map((c) => c[1])
    }
    expect(run("")).toEqual(["default"])
    expect(run("cib_consent=analytics:denied")).toEqual(["default"])
    expect(run("cib_theme=dark; cib_consent=analytics:granted")).toEqual(["default", "update"])
  })

  it("accept all grants analytics_storage only", () => {
    fakeCookies()
    expect(consent.consentUpdate(consent.ACCEPT_ALL)).toEqual({ analytics_storage: "granted" })
    consent.saveConsent(consent.ACCEPT_ALL)
    expect(gtag.mock.calls).toEqual([["consent", "update", { analytics_storage: "granted" }]])
    expect(consent.readConsent()).toEqual({ analytics: true })
  })

  it("customize: save choice with analytics on grants it", () => {
    fakeCookies()
    consent.saveConsent({ analytics: true })
    expect(gtag.mock.calls).toEqual([["consent", "update", { analytics_storage: "granted" }]])
    expect(consent.readConsent()).toEqual({ analytics: true })
  })

  it("customize: save choice with analytics off keeps everything denied", () => {
    const { jar } = fakeCookies()
    jar.set("_ga", "GA1.1.1")
    consent.saveConsent({ analytics: false })
    expect(gtag.mock.calls).toEqual([["consent", "update", { analytics_storage: "denied" }]])
    expect(consent.readConsent()).toEqual({ analytics: false })
    expect(jar.has("_ga")).toBe(false)
  })

  it("save choice with analytics off after accepting drops GA cookies", () => {
    const { jar } = fakeCookies()
    jar.set("_ga", "GA1.1.1")
    jar.set("_ga_TEST", "GS1.1")
    consent.saveConsent({ analytics: false })
    expect(gtag.mock.calls).toEqual([["consent", "update", { analytics_storage: "denied" }]])
    expect(consent.readConsent()).toEqual({ analytics: false })
    expect(jar.has("_ga") || jar.has("_ga_TEST")).toBe(false)
  })

  it("writes the choice per category to one cookie on the parent domain", () => {
    expect(consent.consentCookie(consent.ACCEPT_ALL, { domain: "cybericebox.com", secure: true })).toBe(
      "cib_consent=analytics:granted; path=/; max-age=31536000; SameSite=Lax; domain=.cybericebox.com; Secure",
    )
    expect(consent.consentCookie({ analytics: false }, { secure: false })).toBe("cib_consent=analytics:denied; path=/; max-age=31536000; SameSite=Lax")
    vi.stubEnv("NEXT_PUBLIC_MAIN_HOST", "cybericebox.com")
    const { writes } = fakeCookies()
    consent.saveConsent(consent.ACCEPT_ALL)
    expect(writes[0]).toMatch(/^cib_consent=analytics:granted; .*domain=\.cybericebox\.com/)
  })

  it("reads the stored choice back from the cookie string", () => {
    expect(consent.parseConsent("cib_theme=dark; cib_consent=analytics:granted")).toEqual({ analytics: true })
    expect(consent.parseConsent("cib_consent=analytics:denied")).toEqual({ analytics: false })
    expect(consent.parseConsent("xcib_consent=analytics:granted")).toBeNull()
    expect(consent.parseConsent("cib_consent=granted")).toBeNull()
    expect(consent.parseConsent("")).toBeNull()
  })

  it("shows the banner only when GA is configured and no choice exists", () => {
    expect(consent.shouldShowBanner("G-TEST", null)).toBe(true)
    expect(consent.shouldShowBanner("G-TEST", { analytics: true })).toBe(false)
    expect(consent.shouldShowBanner("G-TEST", { analytics: false })).toBe(false)
    expect(consent.shouldShowBanner(undefined, null)).toBe(false)
    expect(consent.shouldShowBanner("", null)).toBe(false)
  })
})
