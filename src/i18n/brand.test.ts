import { describe, it, expect } from "vitest"
import en from "../../messages/en.json"
import uk from "../../messages/uk.json"
import { BRAND, keepBrand } from "./brand"
import { t } from "./t"

// Brand rule (CyberICEBox CLAUDE.md, «Brand name never wraps»): «Cyber ICE Box» is joined by
// no-break spaces in everything t() returns.
const BREAKABLE = /Cyber[ \t\r\n]+(?:ICE|Ice)[ \t\r\n]+Box/

describe("brand name", () => {
  it("keepBrand joins the words with no-break spaces", () => {
    expect(BRAND).toBe("Cyber\u00A0ICE\u00A0Box")
    expect(keepBrand("© 2026 Cyber ICE Box")).toBe("© 2026 Cyber\u00A0ICE\u00A0Box")
    expect(keepBrand("Cyber Ice Box і Cyber ICE Box")).toBe("Cyber\u00A0Ice\u00A0Box і Cyber\u00A0ICE\u00A0Box")
  })

  it("t() keeps no breakable space inside the brand, for every key", () => {
    let seen = 0
    for (const catalog of [en, uk] as Record<string, string>[]) {
      for (const [key, value] of Object.entries(catalog)) {
        if (!BREAKABLE.test(value)) continue
        seen++
        expect(t(key)).not.toMatch(BREAKABLE)
        expect(t(key)).toContain(BRAND)
      }
    }
    expect(seen).toBeGreaterThan(0)
  })

  it("t() also covers a brand name that arrives through a variable", () => {
    expect(t("{x} ok", { x: "Cyber ICE Box" })).toBe(`${BRAND} ok`)
  })
})
