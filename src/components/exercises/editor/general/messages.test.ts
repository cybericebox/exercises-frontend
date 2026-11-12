import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import uk from "../../../../../messages/editor/a.uk.json"
import en from "../../../../../messages/editor/a.en.json"

const here = import.meta.dirname
const sources = [
  ...fs.readdirSync(here).filter((name) => /\.tsx?$/.test(name) && !/\.test\./.test(name)).map((name) => path.join(here, name)),
  path.join(here, "../../ExerciseGeneralFields.tsx"), path.join(here, "../../ExportDialog.tsx"), path.join(here, "../../ImportDialog.tsx"),
]

describe("package A messages", () => {
  const keys = Object.keys(uk)
  it("have the same keys in uk and en", () => {
    expect(Object.keys(en).sort()).toEqual([...keys].sort())
  })
  it("use only the ed.a. prefix", () => {
    expect(keys.filter((key) => !key.startsWith("ed.a."))).toEqual([])
  })
  it("define every key the code names (a plural or computed prefix needs at least one key under it)", () => {
    const missing: string[] = []
    for (const file of sources) {
      const text = fs.readFileSync(file, "utf8")
      for (const match of text.matchAll(/["`](ed\.a\.[A-Za-z0-9_.]*[A-Za-z0-9_])(\.\$\{|["`])/g)) {
        const key = match[1]
        if (!(keys.includes(key) || keys.some((candidate) => candidate.startsWith(`${key}.`)))) missing.push(`${path.basename(file)}: ${key}`)
      }
    }
    expect(missing).toEqual([])
  })
  it("have no key that the code never names", () => {
    const text = sources.map((file) => fs.readFileSync(file, "utf8")).join("\n")
    const templates = [...text.matchAll(/`(ed\.a\.[^`]*\$\{[^`]*)`/g)].map((match) => new RegExp(`^${match[1].replace(/\./g, "\\.").replace(/\$\{[^}]*\}/g, ".+")}$`))
    const unused = keys.filter((key) => {
      const plural = key.replace(/\.(one|few|many|other)$/, "")
      return !(text.includes(`"${key}"`) || (plural !== key && text.includes(`"${plural}"`)) || templates.some((template) => template.test(key)))
    })
    expect(unused).toEqual([])
  })
})
