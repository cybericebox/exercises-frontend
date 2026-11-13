import { afterEach, describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { Logo } from "./Logo"
import { Wordmark } from "./Wordmark"

afterEach(() => vi.unstubAllEnvs())

// Both anchors are always in the markup; src/styles/cfg.css (tested in cfg.test.ts) shows exactly one.
const anchors = (html: string) => [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0])

describe("Logo and Wordmark link", () => {
  it.each([["Logo", () => <Logo />], ["Wordmark", () => <Wordmark />]])("%s has the main-site anchor and the self anchor", (_, render) => {
    vi.stubEnv("NEXT_PUBLIC_MAIN_SITE_URL", "https://example.org")
    const found = anchors(renderToStaticMarkup(render()))
    expect(found).toHaveLength(2)
    expect(found[0]).toContain('href="https://example.org"')
    expect(found[0]).toContain("cfg-main-only")
    expect(found[1]).toContain('href="/"')
    expect(found[1]).toContain("cfg-main-off")
  })

  it.each([["Logo", () => <Logo />], ["Wordmark", () => <Wordmark />]])("%s keeps both anchors when the setting is empty (the stylesheet hides the first)", (_, render) => {
    vi.stubEnv("NEXT_PUBLIC_MAIN_SITE_URL", "")
    const found = anchors(renderToStaticMarkup(render()))
    expect(found).toHaveLength(2)
    expect(found[0]).toContain('href=""')
    expect(found[1]).toContain('href="/"')
  })

  it("href={null} renders no anchor and an explicit href renders one", () => {
    expect(anchors(renderToStaticMarkup(<Logo href={null} />))).toHaveLength(0)
    expect(anchors(renderToStaticMarkup(<Wordmark href={null} />))).toHaveLength(0)
    expect(anchors(renderToStaticMarkup(<Logo href="/x" />))).toEqual([expect.stringContaining('href="/x"')])
  })
})
