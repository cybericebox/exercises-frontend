import { describe, expect, it, vi } from "vitest"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))

import { emptyDevice, emptyTask, emptyVariant, toSaveDraftInput, type VariantFormValues } from "./exerciseSchemas"
import { planSimplify } from "./simplifyVariants"
import { issueOrder } from "./variantWeights"

function variant(id: string, flag: string, extra: Partial<VariantFormValues> = {}): VariantFormValues {
  const value = emptyVariant(1)
  value.ID = id
  value.Tasks = [{ ...emptyTask(), ID: `task-${id}`, Name: "Scan", Flag: [flag], Attachments: [{ FileID: "f1", Name: "capture.pcap" }] }]
  // Device ids differ per variant (as after an import); the signature compares them by position.
  value.Topology.Devices = [{ ...emptyDevice(), ID: `dev-${id}`, Name: "web", Image: "web:1" }]
  value.Tasks[0].LinkedDeviceID = ""
  return { ...value, ...extra }
}

const numbered = (variants: VariantFormValues[]) => variants.map((value, index) => ({ ...value, Index: index + 1 }))

describe("planSimplify", () => {
  it("has nothing to offer for one variant or different variants", () => {
    expect(planSimplify([variant("a", "ICE{a}")])).toBeNull()
    expect(planSimplify(numbered([variant("a", "ICE{a}"), variant("b", "ICE{b}", { Topology: { ...variant("b", "").Topology, Devices: [] } })]))).toBeNull()
  })

  it("keeps one of identical variants with the summed weight, ignoring ids, number, note and weight", () => {
    const variants = numbered([variant("a", "ICE{a}"), variant("b", "ICE{x}", { Note: "other" }), variant("c", "ICE{a}", { Note: "copy", Weight: 2 }), variant("d", "ICE{x}")])
    const plan = planSimplify(variants)!
    expect(plan.merges).toEqual([{ keep: 0, removed: [2], weight: 3 }, { keep: 1, removed: [3], weight: 2 }])
    expect(plan.variants.map((value) => [value.ID, value.Index, value.Weight])).toEqual([["a", 1, 3], ["b", 2, 2]])
    // The kept «b» differs from variant 1 only by its flag: it is linked too.
    expect(plan.links).toEqual([1])
    expect(plan.count).toBe(3)
    expect(variants[0].Weight).toBe(1)
  })

  it("does not change the issue proportions", () => {
    const variants = numbered([variant("a", "ICE{a}"), variant("b", "ICE{a}"), variant("c", "ICE{c}", { Note: "x", Tasks: [{ ...emptyTask(), Name: "Other" }] }), variant("d", "ICE{a}"), variant("e", "ICE{a}")])
    const plan = planSimplify(variants)!
    const share = (order: number[], ids: string[][]) => ids.map((group) => order.filter((n) => group.includes(String(n))).length)
    const before = issueOrder(variants.map((value) => value.Weight), 500)
    const after = issueOrder(plan.variants.map((value) => value.Weight), 500)
    expect(plan.variants.map((value) => value.Weight)).toEqual([4, 1])
    expect(share(before, [["1", "2", "4", "5"], ["3"]])).toEqual(share(after, [["1"], ["2"]]))
  })

  it("reduces the weights by their common divisor", () => {
    const other = { Tasks: [{ ...emptyTask(), Name: "Other" }] }
    const plan = planSimplify(numbered([variant("a", "ICE{a}"), variant("b", "ICE{a}"), variant("c", "ICE{c}", other), variant("d", "ICE{c}", other)]))!
    expect(plan.variants.map((value) => value.Weight)).toEqual([1, 1])
  })

  it("compares flags and files: a different file is not identical", () => {
    const changed = variant("b", "ICE{a}")
    changed.Tasks[0].Attachments = [{ FileID: "f2", Name: "capture.pcap" }]
    // Not identical, and linking it would repeat the fixed flag of variant 1.
    expect(planSimplify(numbered([variant("a", "ICE{a}"), changed]))).toBeNull()
  })

  it("links variants that differ from variant 1 only by flags or files", () => {
    const variants = numbered([variant("a", "ICE{a}"), variant("b", "ICE{b}"), variant("c", "ICE{c}", { Note: "kept note", Weight: 3 })])
    const plan = planSimplify(variants)!
    expect(plan.merges).toEqual([])
    expect(plan.links).toEqual([1, 2])
    expect(plan.count).toBe(1)
    expect(plan.variants.map((value) => [value.ID, value.LinkedTo, value.Weight, value.Note])).toEqual([["a", "", 1, ""], ["b", "a", 1, ""], ["c", "a", 3, "kept note"]])
    expect(plan.variants[2].Tasks[0].Flag).toEqual(["ICE{c}"])
    expect(plan.variants[2].Tasks[0].ID).toBe("task-a")
  })

  it("leaves a variant independent when linking would repeat a fixed flag of its group", () => {
    const sameFlag = variant("b", "ICE{a}")
    sameFlag.Tasks[0].Attachments = []
    const plan = planSimplify(numbered([variant("a", "ICE{a}"), sameFlag, variant("c", "ICE{c}")]))!
    expect(plan.links).toEqual([2])
  })

  it("offers only the merge part when variant 1 is not saved, and says why", () => {
    const variants = numbered([variant("", "ICE{a}"), variant("", "ICE{a}"), variant("c", "ICE{c}")])
    const plan = planSimplify(variants)!
    expect(plan.links).toEqual([])
    expect(plan.blocked).toEqual({ indexes: [2], reason: "baseUnsaved" })
    expect(plan.count).toBe(1)
    expect(plan.variants.map((value) => value.LinkedTo)).toEqual(["", ""])
  })

  it("explains that a linked variant 1 cannot be a base", () => {
    const plan = planSimplify(numbered([variant("a", "ICE{a}", { LinkedTo: "z" }), variant("b", "ICE{b}")]))!
    expect(plan.blocked?.reason).toBe("baseLinked")
    expect(plan.count).toBe(0)
  })

  it("merges identical linked variants of one base and hands a removed base's dependents to its kept twin", () => {
    const base2 = variant("b", "ICE{a}")
    const dependent = variant("d", "ICE{d}", { LinkedTo: "b" })
    const plan = planSimplify(numbered([variant("a", "ICE{a}"), base2, dependent, variant("e", "ICE{d}", { LinkedTo: "b" })]))!
    expect(plan.merges).toEqual([{ keep: 0, removed: [1], weight: 1 }, { keep: 2, removed: [3], weight: 1 }])
    expect(plan.variants.map((value) => [value.ID, value.LinkedTo, value.Weight])).toEqual([["a", "", 1], ["d", "a", 1]])
  })

  it("keeps a variant whose stored secret cannot be compared", () => {
    const secret = (id: string) => {
      const value = variant(id, "ICE{a}")
      value.Topology.Devices[0].EnvVars = [{ Name: "FLAG", Value: "", Secret: true, HasValue: true }]
      return value
    }
    expect(planSimplify(numbered([secret("a"), secret("b")]))).toBeNull()
  })

  it("merges imported copies whose secrets share a value group and whose files match by hash", () => {
    const imported = (id: string, flagGroup: number, fileHash: string) => {
      const value = variant(id, "ICE{a}")
      value.Topology.Devices[0].EnvVars = [{ Name: "FLAG", Value: "", Secret: true, HasValue: true, ValueGroup: flagGroup }]
      value.Tasks[0].Attachments = [{ FileID: `file-${id}`, Name: "capture.pcap", ContentHash: fileHash }]
      return value
    }
    const plan = planSimplify(numbered([imported("a", 1, "c1"), imported("b", 1, "c1"), imported("c", 1, "c2"), imported("d", 2, "c1")]))!
    expect(plan.merges).toEqual([{ keep: 0, removed: [1], weight: 2 }])
    // «c» differs from variant 1 only by its file (and its flag would repeat, so it stays independent); «d» has its own secret.
    expect(plan.links).toEqual([])
    expect(plan.variants.map((value) => [value.ID, value.Weight])).toEqual([["a", 2], ["c", 1], ["d", 1]])
  })

  it("links a variant that differs only by flag and a file with another hash", () => {
    const withFile = (id: string, flag: string, hash: string) => {
      const value = variant(id, flag)
      value.Tasks[0].Attachments = [{ FileID: `file-${id}`, Name: "capture.pcap", ContentHash: hash }]
      return value
    }
    const plan = planSimplify(numbered([withFile("a", "ICE{a}", "c1"), withFile("b", "ICE{b}", "c2")]))!
    expect(plan.links).toEqual([1])
  })

  it("links a variant that differs only by a device image, which becomes its own image on the base's device", () => {
    const own = variant("b", "ICE{b}")
    own.Topology.Devices[0].Image = "web:2"
    const plan = planSimplify(numbered([variant("a", "ICE{a}"), own]))!
    expect(plan.links).toEqual([1])
    const linked = plan.variants[1]
    expect(linked.LinkedTo).toBe("a")
    expect(linked.Topology.Devices.map((device) => [device.ID, device.Image])).toEqual([["dev-a", "web:2"]])
    expect(toSaveDraftInput({ AdminNote: "", Variants: plan.variants }).Variants[1].ImageOverrides).toEqual([{ DeviceID: "dev-a", Image: "web:2" }])
  })

  it("never makes a weight above 100", () => {
    const same = Array.from({ length: 102 }, (_, index) => variant(`v${index}`, "ICE{a}"))
    const other = variant("o", "ICE{o}", { Tasks: [{ ...emptyTask(), Name: "Other" }] })
    const plan = planSimplify(numbered([...same, other]))!
    expect(Math.max(...plan.variants.map((value) => value.Weight))).toBeLessThanOrEqual(100)
    expect(plan.variants.length).toBeGreaterThan(2)
  })
})
