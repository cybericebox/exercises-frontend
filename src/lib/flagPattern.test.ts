import { describe, expect, it } from "vitest"
import { FlagTemplateNeedsRandomError, parseFlagCandidate, flagTemplateCanProduce } from "./flagPattern"

describe("parseFlagCandidate", () => {
  it("distinguishes a literal-only template from malformed syntax", () => {
    expect(() => parseFlagCandidate("template:ICE{fixed}")).toThrow(FlagTemplateNeedsRandomError)
    let malformedError: unknown
    try {
      parseFlagCandidate("template:ICE{has space}")
    } catch (error) {
      malformedError = error
    }
    expect(malformedError).toBeInstanceOf(Error)
    expect(malformedError).not.toBeInstanceOf(FlagTemplateNeedsRandomError)
  })
  it("keeps legacy metacharacters literal without the template marker", () => {
    expect(parseFlagCandidate("ICE{a[0-9]}")).toMatchObject({ kind: "fixed", cardinality: BigInt(1), example: "ICE{a[0-9]}" })
  })

  it("expands ranges, shorthand classes and deduplicated unions", () => {
    expect(parseFlagCandidate(String.raw`template:ICE{room-[A-C\d]\l}`)).toMatchObject({ kind: "template", cardinality: BigInt(338), example: "ICE{room-Aa}" })
    expect(parseFlagCandidate(String.raw`template:ICE{[A-Cxyz1-3\d]}`).cardinality).toBe(BigInt(16))
    expect(parseFlagCandidate("template:ICE{[a]}").cardinality).toBe(BigInt(1))
  })

  it("subtracts exclusions from the chosen character set within one class", () => {
    expect(parseFlagCandidate(String.raw`template:ICE{[\d^13]}`)).toMatchObject({ cardinality: BigInt(8), example: "ICE{0}" })
    expect(parseFlagCandidate("template:ICE{[a-z^aeiou]}").cardinality).toBe(BigInt(21))
    expect(parseFlagCandidate(String.raw`template:ICE{[A-F\d^B-D3]}`).cardinality).toBe(BigInt(12))
    const pattern = parseFlagCandidate(String.raw`template:ICE{[\d^13]}`)
    expect(flagTemplateCanProduce(pattern, "ICE{2}")).toBe(true)
    expect(flagTemplateCanProduce(pattern, "ICE{1}")).toBe(false)
  })

  it.each([
    "template:ICE{fixed}",
    "template:ICE{[]}",
    "template:ICE{[Z-A]}",
    "template:ICE{[A-a]}",
    "template:ICE{[a-]}",
    "template:ICE{[!@#]}",
    "template:ICE{[^13]}",
    String.raw`template:ICE{[\d^]}`,
    String.raw`template:ICE{[\d^\d]}`,
    String.raw`template:ICE{[\d^a]}`,
    String.raw`template:ICE{[\d^1^2]}`,
    String.raw`template:ICE{\q}`,
    "ICE{has space}",
  ])("rejects malformed %s", (value) => {
    expect(() => parseFlagCandidate(value)).toThrow()
  })

  it("reports whether a fixed flag can also come from a template", () => {
    const pattern = parseFlagCandidate(String.raw`template:ICE{room-[A-C\d]\l}`)
    expect(flagTemplateCanProduce(pattern, "ICE{room-Aa}")).toBe(true)
    expect(flagTemplateCanProduce(pattern, "ICE{room-Zz}")).toBe(false)
  })

  it("retains finite entropy estimates for huge products", () => {
    const pattern = parseFlagCandidate(`template:ICE{${String.raw`\d`.repeat(200)}}`)
    expect(pattern.cardinality.toString()).toHaveLength(201)
    expect(pattern.entropyBits).toBeGreaterThan(660)
    expect(Number.isFinite(pattern.entropyBits)).toBe(true)
  })
})
