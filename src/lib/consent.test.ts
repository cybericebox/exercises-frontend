// Analytics consent (Google Consent Mode v2): denied by default, accept grants analytics only,
// the choice is one cookie on the parent domain, the banner asks only when needed.
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

  it("accept grants analytics_storage only", () => {
    fakeCookies()
    expect(consent.consentUpdate("granted")).toEqual({ analytics_storage: "granted" })
    consent.saveConsent("granted")
    expect(gtag.mock.calls).toEqual([["consent", "update", { analytics_storage: "granted" }]])
  })

  it("reject keeps everything denied and drops GA cookies", () => {
    const { jar } = fakeCookies()
    jar.set("_ga", "GA1.1.1")
    jar.set("_ga_TEST", "GS1.1")
    consent.saveConsent("denied")
    expect(gtag.mock.calls).toEqual([["consent", "update", { analytics_storage: "denied" }]])
    expect(consent.readConsent()).toBe("denied")
    expect(jar.has("_ga") || jar.has("_ga_TEST")).toBe(false)
  })

  it("writes the choice to one cookie on the parent domain", () => {
    expect(consent.consentCookie("granted", { domain: "cybericebox.com", secure: true })).toBe(
      "cib_consent=granted; path=/; max-age=31536000; SameSite=Lax; domain=.cybericebox.com; Secure",
    )
    expect(consent.consentCookie("denied", { secure: false })).toBe("cib_consent=denied; path=/; max-age=31536000; SameSite=Lax")
    vi.stubEnv("NEXT_PUBLIC_DOMAIN", "cybericebox.com")
    const { writes } = fakeCookies()
    consent.saveConsent("granted")
    expect(writes[0]).toMatch(/^cib_consent=granted; .*domain=\.cybericebox\.com/)
  })

  it("reads the stored choice back from the cookie string", () => {
    expect(consent.parseConsent("ib_theme=dark; cib_consent=granted")).toBe("granted")
    expect(consent.parseConsent("cib_consent=denied")).toBe("denied")
    expect(consent.parseConsent("xcib_consent=granted")).toBeNull()
    expect(consent.parseConsent("")).toBeNull()
  })

  it("shows the banner only when GA is configured and no choice exists", () => {
    expect(consent.shouldShowBanner("G-TEST", null)).toBe(true)
    expect(consent.shouldShowBanner("G-TEST", "granted")).toBe(false)
    expect(consent.shouldShowBanner("G-TEST", "denied")).toBe(false)
    expect(consent.shouldShowBanner(undefined, null)).toBe(false)
    expect(consent.shouldShowBanner("", null)).toBe(false)
  })
})
