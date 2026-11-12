import { describe, expect, it } from "vitest"
import shellEn from "../../messages/editor/shell.en.json"
import shellUk from "../../messages/editor/shell.uk.json"
import uiEn from "../../messages/editor/ui.en.json"
import uiUk from "../../messages/editor/ui.uk.json"
import aEn from "../../messages/editor/a.en.json"
import aUk from "../../messages/editor/a.uk.json"
import bEn from "../../messages/editor/b.en.json"
import bUk from "../../messages/editor/b.uk.json"
import cEn from "../../messages/editor/c.en.json"
import cUk from "../../messages/editor/c.uk.json"
import dEn from "../../messages/editor/d.en.json"
import dUk from "../../messages/editor/d.uk.json"
import baseUk from "../../messages/uk.json"

type Pair = { prefix: string; en: Record<string, string>; uk: Record<string, string> }
const FILES: Pair[] = [
  { prefix: "ed.shell.", en: shellEn, uk: shellUk },
  { prefix: "ed.ui.", en: uiEn, uk: uiUk },
  { prefix: "ed.a.", en: aEn, uk: aUk },
  { prefix: "ed.b.", en: bEn, uk: bUk },
  { prefix: "ed.c.", en: cEn, uk: cUk },
  { prefix: "ed.d.", en: dEn, uk: dUk },
]
const vars = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()

describe("editor message files", () => {
  for (const file of FILES) {
    describe(file.prefix, () => {
      it("has the same keys in uk and en", () => {
        expect(Object.keys(file.uk).sort()).toEqual(Object.keys(file.en).sort())
      })

      it("keeps every key under its package prefix", () => {
        for (const key of Object.keys(file.uk)) expect(key.startsWith(file.prefix)).toBe(true)
      })

      it("has no blank values and the same variables in both languages", () => {
        for (const [key, value] of Object.entries(file.uk)) {
          expect(value.trim(), key).not.toBe("")
          expect(file.en[key]?.trim(), key).toBeTruthy()
          expect(vars(value), key).toEqual(vars(file.en[key]))
        }
      })

      it("never gives an example with «наприклад»", () => {
        for (const [key, value] of Object.entries(file.uk)) expect(/наприклад/i.test(value), key).toBe(false)
      })
    })
  }

  it("does not repeat a key across files or shadow the flat catalog", () => {
    const seen = new Set<string>()
    for (const file of FILES) for (const key of Object.keys(file.uk)) {
      expect(seen.has(key), key).toBe(false)
      expect(key in baseUk, key).toBe(false)
      seen.add(key)
    }
  })
})
