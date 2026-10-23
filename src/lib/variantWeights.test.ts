import { describe, expect, it } from "vitest"
import { gcd, issueOrder } from "./variantWeights"

describe("issueOrder", () => {
  it("issues the variant least issued relative to its weight, ties to the lowest number", () => {
    expect(issueOrder([2, 1], 6)).toEqual([1, 2, 1, 1, 2, 1])
    expect(issueOrder([1, 1, 1], 6)).toEqual([1, 2, 3, 1, 2, 3])
    expect(issueOrder([1, 3], 8)).toEqual([1, 2, 2, 2, 1, 2, 2, 2])
  })

  it("keeps the proportions over a long run", () => {
    const order = issueOrder([3, 1, 2], 600)
    expect([1, 2, 3].map((n) => order.filter((value) => value === n).length)).toEqual([300, 100, 200])
  })

  it("shows 14 issues by default and reads a missing weight as 1", () => {
    expect(issueOrder([1, 1])).toHaveLength(14)
    expect(issueOrder([0, Number.NaN], 4)).toEqual([1, 2, 1, 2])
    expect(issueOrder([])).toEqual([])
  })

  it("gcd", () => {
    expect(gcd(4, 6)).toBe(2)
    expect(gcd(0, 5)).toBe(5)
  })
})
