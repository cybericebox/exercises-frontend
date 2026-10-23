/**
 * Row actions show on hover or focus (always on touch), the same way in every repeatable list of the editor:
 * each row trash either takes the shared REVEAL_ON_HOVER classes or sits in a row whose CSS hides it the same way.
 */
import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

const dir = path.dirname(new URL(import.meta.url).pathname)
const css = fs.readFileSync(path.join(dir, "../../styles/exercise-general.css"), "utf8")
// Rows hidden through their own CSS class (checked below), not the shared Tailwind classes.
const CSS_ROWS: Record<string, string> = { "AttachmentList.tsx": "subtask-file-actions", "HintsEditor.tsx": "hint-row-actions", "TaskAccordion.tsx": "subtasks-remove", "ConfirmRemoveAction.tsx": "the wrapper passes props through" }

describe("row actions", () => {
  it("every row trash in the editor lists is revealed on hover or focus, and shown on touch", () => {
    const files = fs.readdirSync(dir).filter((file) => file.endsWith(".tsx") && !file.includes(".test."))
    for (const file of files) {
      const source = fs.readFileSync(path.join(dir, file), "utf8")
      const uses = source.match(/<RemoveAction\b[\s\S]*?\/>/g) ?? []
      if (uses.length === 0 || CSS_ROWS[file]) continue
      for (const use of uses) expect(use, file).toContain("wrapperClassName={REVEAL_ON_HOVER}")
    }
  })

  it("the CSS-hidden rows show on hover, on focus within and on touch", () => {
    for (const name of ["subtask-file-actions", "hint-row-actions"]) {
      expect(css).toMatch(new RegExp(`:hover \\.${name}`))
      expect(css).toMatch(new RegExp(`:focus-within \\.${name}`))
      expect(css).toMatch(new RegExp(`@media \\(hover:none\\) \\{ \\.${name} \\{ opacity:1; \\}`))
    }
  })
})
