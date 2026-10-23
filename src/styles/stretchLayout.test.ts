/**
 * Blocks that stretch to the bottom of the screen (the infrastructure canvas, the all-variants table, the catalog
 * table) do it with flex only: no height measured against the viewport (100vh/100dvh minus the header), which
 * overflowed the main area and cut off the canvas bottom.
 */
import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

const dir = path.dirname(new URL(import.meta.url).pathname)
const read = (file: string) => fs.readFileSync(path.join(dir, file), "utf8")
const rule = (css: string, selector: string) => css.match(new RegExp(`(?:^|\\n)${selector.replace(/[.]/g, "\\.")}\\s*\\{([^}]*)\\}`))?.[1] ?? ""

describe("stretch to the bottom by flex", () => {
  it("has no viewport-based heights in the stretch blocks", () => {
    const general = read("exercise-general.css")
    const catalog = read("catalog.css")
    for (const [css, selector] of [[general, ".exercise-general-screen"], [general, ".topology-workspace"], [general, ".all-variants-scroll"], [catalog, ".catalog-screen"]] as const) {
      const body = rule(css, selector)
      expect(body, selector).not.toBe("")
      expect(body, selector).not.toMatch(/\d+d?vh|calc\(|height:100%/)
    }
  })

  it("fills the main area: the screen grows, the canvas and the table take the rest and scroll inside", () => {
    const general = read("exercise-general.css")
    expect(rule(general, ".exercise-general-screen")).toMatch(/flex:1 0 auto/)
    expect(rule(general, ".topology-workspace")).toMatch(/flex:1 1 auto[\s\S]*flex-basis:0/)
    expect(rule(general, ".all-variants-scroll")).toMatch(/flex:1 1 0[\s\S]*overflow:auto/)
    expect(rule(read("catalog.css"), ".catalog-screen")).toMatch(/flex:1 1 auto[\s\S]*min-height:0/)
  })
})
