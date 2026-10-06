/**
 * Drift check (T24): the design-system copies (src/styles/ds-tokens.css, the crest files) match manifest.json,
 * and, when docs/design-system is reachable, still match their source. Fix: node scripts/ds-sync.mjs.
 */
import { describe, it, expect } from "vitest"
import { check } from "../../scripts/ds-sync.mjs"

describe("design system copy", () => {
  it("is in sync with manifest.json and docs/design-system", () => {
    expect(check()).toEqual([])
  })
})
