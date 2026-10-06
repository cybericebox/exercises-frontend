import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

// One Ukrainian apostrophe everywhere: ʼ (U+02BC). A straight ' or a typographic ’ between two Ukrainian letters is a mistake.
const root = resolve(import.meta.dirname, "..")
const MIXED = /[а-яіїєґА-ЯІЇЄҐ]['’][а-яіїєґА-ЯІЇЄҐ]/g

describe("Ukrainian apostrophe", () => {
  for (const file of ["messages/uk.json", "messages/errors.uk.json"]) {
    it(`${file} uses only ʼ inside words`, () => {
      const found = readFileSync(resolve(root, file), "utf8").match(MIXED) ?? []
      expect(found).toEqual([])
    })
  }
})
