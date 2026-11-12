import { describe, expect, it } from "vitest"
import { normalizeWeight } from "./variantWeights"

describe("normalizeWeight", () => {
  it("keeps a whole number from 1", () => {
    expect(normalizeWeight(3)).toBe(3)
    expect(normalizeWeight(100)).toBe(100)
  })
  it("reads absent, 0, fractions and garbage as 1", () => {
    for (const raw of [undefined, null, 0, -2, 1.5, Number.NaN, "4"]) expect(normalizeWeight(raw)).toBe(1)
  })
})
