// @vitest-environment jsdom
/**
 * cfg.css hides the optional blocks by the setting attributes of <html> (src/lib/settings.ts). The selectors are run by a real selector engine
 * against every state of the settings (absent, empty, set), so the contract of each cfg-* class is pinned: shown exactly when its rule says so.
 */
import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"

const css = fs.readFileSync(path.resolve(import.meta.dirname, "cfg.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
// every rule of the file is "selector list { display: none !important; }"
const hidingSelectors = [...css.matchAll(/([^{}]+)\{\s*display:\s*none\s*!important;\s*\}/g)].flatMap((m) => m[1].split(/,\s*(?![^(]*\))/).map((s) => s.trim()).filter(Boolean))

type Value = "absent" | "empty" | "set"
const VALUES: Value[] = ["absent", "empty", "set"]
const ATTRS = { main: "data-cfg-main-site-url", cookies: "data-cfg-cookies-url" } as const
type State = Record<keyof typeof ATTRS, Value>

function hidden(cls: string, settings: State): boolean {
  const html = document.documentElement
  for (const attr of Object.values(ATTRS)) html.removeAttribute(attr)
  for (const [key, attr] of Object.entries(ATTRS)) {
    const v = settings[key as keyof typeof ATTRS]
    if (v !== "absent") html.setAttribute(attr, v === "set" ? "https://example.org/x" : "")
  }
  document.body.innerHTML = `<div id="probe" class="${cls}"></div>`
  const probe = document.getElementById("probe")!
  return hidingSelectors.some((selector) => probe.matches(selector))
}

const states: State[] = VALUES.flatMap((main) => VALUES.map((cookies) => ({ main, cookies })))

describe("cfg.css", () => {
  it("has at least one rule per contract class", () => {
    for (const cls of ["cfg-main-only", "cfg-main-off", "cfg-cookies"]) {
      expect(hidingSelectors.some((selector) => selector.includes(`.${cls}`)), cls).toBe(true)
    }
  })

  it("shows a block exactly when its rule says so, for every combination of the settings", () => {
    for (const s of states) {
      const label = JSON.stringify(s)
      expect(hidden("cfg-main-only", s), `main-only ${label}`).toBe(s.main !== "set")
      expect(hidden("cfg-main-off", s), `main-off ${label}`).toBe(s.main === "set")
      expect(hidden("cfg-cookies", s), `cookies ${label}`).toBe(s.cookies !== "set")
    }
  })

  it("never hides a block that has no cfg class", () => {
    expect(hidden("plain", { main: "absent", cookies: "absent" })).toBe(false)
  })
})
