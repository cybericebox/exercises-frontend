/**
 * The editor's tab strip: the active tab's 2px bar sits exactly on the strip's bottom divider (inside the tab, so the
 * scrolling tab list never clips it) and spans the tab's label padding; one control height; focus ring on every tab.
 */
import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

const css = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "exercise-general.css"), "utf8")
const rule = (selector: string) => css.match(new RegExp(`(?:^|\\n)${selector.replace(/[.[\]=:()]/g, "\\$&")}\\s*\\{([^}]*)\\}`))?.[1] ?? ""

describe("editor tab strip", () => {
  it("is one control high, its divider drawn at the very bottom under the tabs", () => {
    expect(rule(".editor-tabs")).toMatch(/height:var\(--ctl\)/)
    expect(rule(".editor-tabs::after")).toMatch(/bottom:0; height:1px/)
    expect(rule(".editor-tablist")).toMatch(/z-index:1/)
  })

  it("puts the active bar on the divider, as wide as the label padding, for every tab", () => {
    const bar = rule(".editor-tab[aria-selected=true]::after")
    expect(bar).toMatch(/bottom:0; height:2px/)
    expect(bar).toMatch(/left:var\(--tab-pad\); right:var\(--tab-pad\)/)
    expect(rule(".editor-tab")).toMatch(/height:100%; padding:0 var\(--tab-pad\)/)
    expect(rule(".editor-tab:hover")).toMatch(/color:var\(--ib-ink\)/)
    expect(rule(".editor-tab:focus-visible")).toMatch(/outline:2px solid/)
  })
})
