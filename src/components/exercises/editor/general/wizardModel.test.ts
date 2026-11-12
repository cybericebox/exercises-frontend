import { describe, expect, it } from "vitest"
import { answerError, baseInfo, buildLinked, defaultPreset, firstError, imageError, insertionPoint, nothingOwn, ownAnswers, ownFiles, ownImagesOf, parseCount, parseWeight, presetBlocked, presetOwn, syncFill } from "./wizardModel"
import { baseVariant, linkedVariant } from "./testkit"

function deliveredBase() {
  const a = baseVariant()
  a.Topology.Devices[0].Bootstrap.Env = [{ Name: "FLAG", Value: "{{task.t1}}", Secret: false, HasValue: true, ValueGroup: 0 }]
  return a
}

describe("wizardModel", () => {
  it("parses the count and the weight", () => {
    expect(parseCount("3")).toBe(3)
    expect(parseCount("0")).toBeNull()
    expect(parseCount("51")).toBeNull()
    expect(parseCount("1.5")).toBeNull()
    expect(parseWeight("100")).toBe(100)
    expect(parseWeight("0")).toBeNull()
    expect(parseWeight("101")).toBeNull()
  })

  it("splits the answers into free and delivered", () => {
    const info = baseInfo(deliveredBase())
    expect(info.delivered).toEqual([0])
    expect(info.free).toEqual([1])
  })

  it("picks the default preset: files, else answers, else image", () => {
    const a = baseVariant()
    expect(defaultPreset(a)).toBe("answers")
    a.Tasks[1].Attachments = [{ FileID: "f", Name: "x" }]
    expect(defaultPreset(a)).toBe("files")
    const noFree = deliveredBase()
    noFree.Tasks.splice(1, 1)
    expect(defaultPreset(noFree)).toBe("image")
  })

  it("blocks «Інші відповіді» when every answer reaches the lab", () => {
    const only = deliveredBase()
    only.Tasks.splice(1, 1)
    expect(presetBlocked("answers", only)).toBe(true)
    expect(presetBlocked("answers", deliveredBase())).toBe(false)
    expect(presetBlocked("files", only)).toBe(false)
  })

  it("ticks the rows a preset starts with", () => {
    const a = baseVariant()
    a.Tasks[1].Attachments = [{ FileID: "f", Name: "x" }]
    const files = presetOwn("files", a)
    expect(ownFiles(files)).toEqual([1])
    expect(ownAnswers(files)).toEqual([1])
    expect(ownImagesOf(presetOwn("image", a))).toEqual(["d1"])
    expect(ownAnswers(presetOwn("answers", a))).toEqual([0])
    expect(nothingOwn(presetOwn("copy", a))).toBe(true)
  })

  it("keeps typed values when the ticked rows change and generates flags for new ones", () => {
    const a = baseVariant()
    const own = presetOwn("answers", a)
    const first = syncFill(a, own, 2, [])
    expect(first).toHaveLength(2)
    expect(first[0].ans[0]).toMatch(/^ICE\{[0-9a-f]{16}\}$/)
    expect(first[0].ans[0]).not.toBe(first[1].ans[0])
    first[0].ans[0] = "ICE{typed}"
    const more = syncFill(a, { ...own, ans: { 0: true, 1: true } }, 3, first)
    expect(more[0].ans[0]).toBe("ICE{typed}")
    expect(more[0].ans[1]).toBe("")
    expect(more).toHaveLength(3)
    const fewer = syncFill(a, { ...own, ans: {} }, 1, more)
    expect(fewer[0].ans).toEqual({})
  })

  it("reports answer errors: empty after a try, malformed, taken, twice", () => {
    const a = baseVariant()
    const b = linkedVariant("b", "a", a, { first: ["ICE{bbbb}"] })
    const variants = [a, b]
    const fills = [{ ans: { 0: "" }, files: {}, img: {} }, { ans: { 0: "ICE{aaaa}" }, files: {}, img: {} }, { ans: { 0: "ICE{new1}" }, files: {}, img: {} }, { ans: { 0: "ICE{new1}" }, files: {}, img: {} }, { ans: { 0: "no flag" }, files: {}, img: {} }]
    expect(answerError(variants, 0, fills, 0, 0, false)).toBe("")
    expect(answerError(variants, 0, fills, 0, 0, true)).toBe("required")
    expect(answerError(variants, 0, fills, 1, 0, true)).toBe("taken")
    expect(answerError(variants, 0, fills, 2, 0, true)).toBe("twice")
    expect(answerError(variants, 0, fills, 4, 0, true)).not.toMatch(/^(required|taken|twice|)$/)
  })

  it("rejects an image equal to the base image and finds the first error", () => {
    const a = baseVariant()
    const own = presetOwn("image", a)
    const same = [{ ans: {}, files: {}, img: { d1: "img:1" } }]
    expect(imageError(a, same, 0, "d1", true)).toBe("same")
    expect(imageError(a, [{ ans: {}, files: {}, img: { d1: "" } }], 0, "d1", false)).toBe("")
    expect(imageError(a, [{ ans: {}, files: {}, img: { d1: "" } }], 0, "d1", true)).toBe("required")
    expect(firstError([a], 0, own, same, true)).toBe("wz-i-0-d1")
    expect(firstError([a], 0, own, [{ ans: {}, files: {}, img: { d1: "img:2" } }], true)).toBeNull()
  })

  it("builds linked variants with their own answers, files and images, and the weight", () => {
    const a = baseVariant()
    a.Tasks[1].Attachments = [{ FileID: "f", Name: "x" }]
    const own = { ans: { 0: true }, files: { 1: true }, img: { d1: true } }
    const fills = [{ ans: { 0: "ICE{one}" }, files: { 1: [{ FileID: "n1", Name: "n.zip" }] }, img: { d1: "img:2" }, weight: "5" }, { ans: { 0: "ICE{two}" }, files: { 1: [{ FileID: "n2", Name: "m.zip" }] }, img: { d1: "img:3" } }]
    const created = buildLinked([a], 0, own, fills, 2)
    expect(created).toHaveLength(2)
    expect(created[0].LinkedTo).toBe("a")
    expect(created[0].Tasks[0].Check.Answer.Values).toEqual(["ICE{one}"])
    expect(created[0].Tasks[1].Attachments).toEqual([{ FileID: "n1", Name: "n.zip" }])
    expect(created[0].ImageOverrides).toEqual([{ DeviceID: "d1", Image: "img:2" }])
    expect(created[0].Weight).toBe(5)
    expect(created[1].Weight).toBe(2)
    expect(created[1].Index).toBe(3)
  })

  it("inserts new variants after the base and the variants already based on it", () => {
    const a = baseVariant()
    const b = linkedVariant("b", "a", a)
    const c = baseVariant({ ID: "c" })
    expect(insertionPoint([a, b, c], 0)).toBe(2)
    expect(insertionPoint([a, b, c], 2)).toBe(3)
  })
})
