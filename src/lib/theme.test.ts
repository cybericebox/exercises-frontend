import { afterEach, describe, expect, it, vi } from "vitest"
import { applyTheme, readThemeChoice, setThemeChoice } from "./theme"

describe("shared platform theme", () => {
  afterEach(() => {
    document.cookie = "ib_theme=; path=/; max-age=0"
    vi.unstubAllGlobals()
  })

  it("uses the same cookie as the landing and ID apps", () => {
    setThemeChoice("dark")
    expect(readThemeChoice()).toBe("dark")
    expect(document.documentElement.dataset.theme).toBe("dark")
  })

  it("follows the OS appearance in system mode", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })))
    applyTheme("system")
    expect(document.documentElement.dataset.theme).toBe("dark")
  })
})
