/**
 * Every progress bar keeps a visible track at 0 %: in the dark theme --secondary / --muted are --ib-hero, which is
 * --ib-paper itself (the page background), so a bg-secondary or bg-muted track vanishes there. A track uses the hairline
 * token --ib-line (bg-border), the same contrast as every border.
 */
import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"

const SRC = path.resolve(import.meta.dirname, "..")

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) return files(file)
    return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) ? [file] : []
  })
}

/** The opening tag of each progressbar element and the opening tag inside it (a track drawn by an aria-hidden child). */
function progressBars(): { where: string; markup: string }[] {
  return files(SRC).flatMap((file) => {
    const text = fs.readFileSync(file, "utf8")
    return [...text.matchAll(/role="progressbar"/g)].map((match) => {
      const start = text.lastIndexOf("<", match.index)
      const end = text.indexOf("style=", match.index)
      return { where: `${path.relative(SRC, file)}:${text.slice(0, match.index).split("\n").length}`, markup: text.slice(start, end) }
    })
  })
}

describe("progress tracks", () => {
  const bars = progressBars()

  it("finds the progress bars of the app", () => {
    expect(bars.length).toBeGreaterThanOrEqual(5)
  })

  it("never draws a track in the page background colour (bg-secondary, bg-muted)", () => {
    expect(bars.filter((bar) => /\bbg-(secondary|muted)\b/.test(bar.markup)).map((bar) => bar.where)).toEqual([])
  })

  it("draws every track in the hairline token", () => {
    const css = fs.readFileSync(path.join(SRC, "styles/exercise-import.css"), "utf8")
    expect(css).toMatch(/\.exercise-import-progress\{[^}]*background:var\(--ib-line\)/)
    expect(bars.filter((bar) => !/\bbg-border\b|exercise-import-progress/.test(bar.markup)).map((bar) => bar.where)).toEqual([])
  })
})
