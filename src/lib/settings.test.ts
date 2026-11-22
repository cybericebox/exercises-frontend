// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { createElement } from "react"
import { cfg, settingsAttrs } from "@/lib/settings"

afterEach(() => { vi.unstubAllEnvs(); document.documentElement.removeAttribute("data-cfg-cookies-url"); document.documentElement.removeAttribute("data-cfg-main-site-url") })

describe("settingsAttrs", () => {
  it("copies each value as it is (the placeholder of an image build, a real value, an empty string)", () => {
    vi.stubEnv("NEXT_PUBLIC_COOKIES_URL", "__NEXT_PUBLIC_COOKIES_URL__")
    vi.stubEnv("NEXT_PUBLIC_MAIN_SITE_URL", "https://example.org")
    expect(settingsAttrs()["data-cfg-cookies-url"]).toBe("__NEXT_PUBLIC_COOKIES_URL__")
    expect(settingsAttrs()["data-cfg-main-site-url"]).toBe("https://example.org")
    vi.stubEnv("NEXT_PUBLIC_COOKIES_URL", "")
    expect(settingsAttrs()["data-cfg-cookies-url"]).toBe("")
  })

  it("renders an empty value as data-cfg-x=\"\" and leaves an unset one out", () => {
    vi.stubEnv("NEXT_PUBLIC_COOKIES_URL", "")
    delete process.env.NEXT_PUBLIC_MAIN_SITE_URL
    const markup = renderToStaticMarkup(createElement("html", settingsAttrs()))
    expect(markup).toContain('data-cfg-cookies-url=""')
    expect(markup).not.toContain("data-cfg-main-site-url")
  })
})

describe("cfg", () => {
  it("reads the value from <html>, empty when absent", () => {
    expect(cfg("cookies-url")).toBe("")
    document.documentElement.setAttribute("data-cfg-cookies-url", "https://example.org/cookies")
    expect(cfg("cookies-url")).toBe("https://example.org/cookies")
  })
})
