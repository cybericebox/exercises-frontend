import { afterEach, describe, expect, it, vi } from "vitest"
import { THEME_BOOT_SCRIPT, applyTheme, readThemeChoice, setThemeChoice } from "./theme"

describe("shared platform theme", () => {
  afterEach(() => {
    document.cookie = "cib_theme=; path=/; max-age=0"
    document.cookie = "ib_theme=; path=/; max-age=0"
    vi.unstubAllGlobals()
  })

  it("uses the same cookie as the landing and ID apps", () => {
    setThemeChoice("dark")
    expect(readThemeChoice()).toBe("dark")
    expect(document.documentElement.dataset.theme).toBe("dark")
  })

  it("moves the old ib_theme cookie to cib_theme on read", () => {
    document.cookie = "ib_theme=dark; path=/"
    expect(readThemeChoice()).toBe("dark")
    expect(document.cookie).toContain("cib_theme=dark")
    expect(document.cookie).not.toMatch(/(^|; )ib_theme=/)
  })

  it("migrates in the boot script before first paint", () => {
    document.cookie = "ib_theme=dark; path=/"
    new Function(THEME_BOOT_SCRIPT)()
    expect(document.documentElement.dataset.theme).toBe("dark")
    expect(document.cookie).toContain("cib_theme=dark")
    expect(document.cookie).not.toMatch(/(^|; )ib_theme=/)
  })

  it("keeps cib_theme over a leftover ib_theme", () => {
    document.cookie = "ib_theme=dark; path=/"
    document.cookie = "cib_theme=light; path=/"
    expect(readThemeChoice()).toBe("light")
    expect(document.cookie).toContain("ib_theme=dark")
  })

  it("follows the OS appearance in system mode", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })))
    applyTheme("system")
    expect(document.documentElement.dataset.theme).toBe("dark")
  })
})
