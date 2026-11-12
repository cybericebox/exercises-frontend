import { describe, expect, it } from "vitest"
import { baseIndexOf, detachVariantAt, displayOrder, duplicateVariantAt, needlessVariants, removeVariantAt, variantSummary, weightShares } from "./variantsModel"
import { baseVariant, linkedVariant } from "./testkit"

const tr = (key: string, vars?: Record<string, string | number>) => vars ? `${key}${JSON.stringify(vars)}` : key

describe("variantsModel", () => {
  it("finds the base of a linked variant and orders every base before its variants", () => {
    const a = baseVariant()
    const b = baseVariant({ ID: "b", Index: 2 })
    const c = linkedVariant("c", "a", a, { first: ["ICE{cccc}"] })
    const variants = [a, b, c]
    expect(baseIndexOf(variants, 2)).toBe(0)
    expect(baseIndexOf(variants, 1)).toBe(-1)
    expect(displayOrder(variants)).toEqual([0, 2, 1])
  })

  it("computes the shares of the weights", () => {
    expect(weightShares([1, 1, 2])).toEqual([25, 25, 50])
    expect(weightShares([0, 0])).toEqual([0, 0])
    expect(weightShares([Number.NaN, 4])).toEqual([0, 100])
  })

  it("says variants are not needed when the answer reaches the lab", () => {
    const a = baseVariant()
    a.Topology.Devices[0].Bootstrap.Env = [{ Name: "FLAG", Value: "{{task.t1}}", Secret: false, HasValue: true, ValueGroup: 0 }]
    const b = linkedVariant("b", "a", a, { first: ["ICE{bbbb}"] })
    expect(needlessVariants([a, b])).toBe(true)
    // an own file or image makes the variant worth having
    expect(needlessVariants([a, linkedVariant("b", "a", a, { first: ["ICE{bbbb}"], files: [{ FileID: "f", Name: "x.zip" }] })])).toBe(false)
    expect(needlessVariants([a, linkedVariant("b", "a", a, { first: ["ICE{bbbb}"], images: [{ DeviceID: "d1", Image: "img:2" }] })])).toBe(false)
  })

  it("does not call variants needless when the answer does not reach the lab", () => {
    const a = baseVariant()
    expect(needlessVariants([a, linkedVariant("b", "a", a, { first: ["ICE{bbbb}"] })])).toBe(false)
    expect(needlessVariants([a])).toBe(false)
  })

  it("summarises what a variant has of its own", () => {
    const a = baseVariant()
    const b = linkedVariant("b", "a", a, { first: ["ICE{bbbb}"], files: [{ FileID: "f", Name: "x.zip" }], images: [{ DeviceID: "d1", Image: "img:2" }] })
    const c = baseVariant({ ID: "c", Index: 3 })
    const variants = [a, b, c]
    expect(variantSummary(variants, 0, tr)).toBe('ed.a.variants.sum.ownWithKids{"count":1}')
    expect(variantSummary(variants, 1, tr)).toBe('ed.a.variants.sum.flags.one{"count":1} · ed.a.variants.sum.files.one{"count":1} · ed.a.variants.sum.images.one{"devices":"web"}')
    expect(variantSummary(variants, 2, tr)).toBe("ed.a.variants.sum.separate")
    expect(variantSummary([a, linkedVariant("d", "a", a)], 1, tr)).toBe("ed.a.variants.sum.nothing")
  })

  it("deleting a base keeps the variants based on it as separate ones", () => {
    const a = baseVariant()
    const b = linkedVariant("b", "a", a, { first: ["ICE{bbbb}"] })
    const result = removeVariantAt([a, b], 0)
    expect(result).toHaveLength(1)
    expect(result[0].ID).toBe("b")
    expect(result[0].LinkedTo).toBe("")
  })

  it("detaching drops the link and the list of own images", () => {
    const a = baseVariant()
    const b = linkedVariant("b", "a", a, { images: [{ DeviceID: "d1", Image: "img:2" }] })
    const result = detachVariantAt([a, b], 1)
    expect(result[1].LinkedTo).toBe("")
    expect(result[1].ImageOverrides).toEqual([])
    expect(result[0]).toBe(a)
  })

  it("duplicates after the variant and its group, as a separate copy that takes what a linked one does not own from its base", () => {
    const a = baseVariant()
    a.Tasks[0].Attachments = [{ FileID: "f1", Name: "base.zip" }]
    const b = linkedVariant("b", "a", a, { first: [] })
    const d = baseVariant({ ID: "d", Index: 3 })
    const copy = duplicateVariantAt([a, b, d], 0)
    expect(copy.at).toBe(2)
    expect(copy.variants.map((variant) => variant.ID)).toEqual(["a", "b", "", "d"])
    expect(copy.variants[2].LinkedTo).toBe("")
    expect(copy.variants[2].CopyOf).toBe("a")
    const fromLinked = duplicateVariantAt([a, b], 1)
    expect(fromLinked.at).toBe(2)
    expect(fromLinked.variants[2].LinkedTo).toBe("")
    expect(fromLinked.variants[2].Tasks[0].Check.Answer.Values).toEqual(["ICE{aaaa}"])
    expect(fromLinked.variants[2].Tasks[0].Attachments).toEqual([{ FileID: "f1", Name: "base.zip" }])
  })
})
