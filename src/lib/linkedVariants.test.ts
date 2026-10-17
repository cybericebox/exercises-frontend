import { describe, it, expect, vi } from "vitest"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))

import { emptyDevice, emptyTask, emptyVariant, type VariantFormValues } from "./exerciseSchemas"
import {
  baseCandidates,
  copyVariant,
  dependentsOf,
  linkedFlagConflicts,
  newLinkedVariant,
  syncLinkedVariants,
} from "./linkedVariants"

function task(id: string, name: string, flag: string[] = [], files: string[] = []) {
  return {
    ...emptyTask(),
    ID: id,
    Name: name,
    Flag: flag,
    Attachments: files.map((f) => ({ FileID: f, Name: f })),
    Hints: [{ ID: `h-${id}`, Text: `hint ${name}`, Level: "nudge" as const }],
  }
}

function variant(id: string, index: number, tasks: ReturnType<typeof task>[], linkedTo = "", note = ""): VariantFormValues {
  return { ...emptyVariant(index), ID: id, Note: note, LinkedTo: linkedTo, Tasks: tasks }
}

describe("syncLinkedVariants", () => {
  it("copies base text, hints and topology and keeps own flag, files and note", () => {
    const base = variant("b", 1, [task("t1", "Base name", ["ICE{base}"], ["base.txt"])])
    base.Topology.Devices = [{ ...emptyDevice(), ID: "d1", Name: "web" }]
    const linked = variant("l", 2, [task("t1", "Old name", ["ICE{own}"], ["own.txt"])], "b", "my note")
    const out = syncLinkedVariants([base, linked])
    expect(out[1].Tasks[0].Name).toBe("Base name")
    expect(out[1].Tasks[0].Hints[0].Text).toBe("hint Base name")
    expect(out[1].Topology.Devices[0].Name).toBe("web")
    expect(out[1].Tasks[0].Flag).toEqual(["ICE{own}"])
    expect(out[1].Tasks[0].Attachments[0].FileID).toBe("own.txt")
    expect(out[1].Note).toBe("my note")
    expect(out[1].ID).toBe("l")
    expect(out[1].Index).toBe(2)
    expect(out[1].LinkedTo).toBe("b")
    expect(out[1].Topology).not.toBe(base.Topology)
    expect(out[1].Tasks[0].Hints).not.toBe(base.Tasks[0].Hints)
    expect(out[0]).toBe(base)
  })

  it("matches own parts by task id after a base reorder", () => {
    const base = variant("b", 1, [task("t2", "Two"), task("t1", "One")])
    const linked = variant("l", 2, [task("t1", "One", ["f1"]), task("t2", "Two", ["f2"])], "b")
    const out = syncLinkedVariants([base, linked])
    expect(out[1].Tasks.map((x) => x.ID)).toEqual(["t2", "t1"])
    expect(out[1].Tasks[0].Flag).toEqual(["f2"])
    expect(out[1].Tasks[1].Flag).toEqual(["f1"])
  })

  it("drops own parts of a removed base task", () => {
    const base = variant("b", 1, [task("t1", "One")])
    const linked = variant("l", 2, [task("t1", "One", ["f1"]), task("t2", "Two", ["f2"])], "b")
    const out = syncLinkedVariants([base, linked])
    expect(out[1].Tasks).toHaveLength(1)
    expect(out[1].Tasks[0].Flag).toEqual(["f1"])
  })

  it("matches by position when an id is empty, and leaves a new base task without own parts", () => {
    const base = variant("b", 1, [task("", "One"), task("t9", "New")])
    const linked = variant("l", 2, [task("", "One", ["f1"])], "b")
    const out = syncLinkedVariants([base, linked])
    expect(out[1].Tasks[0].Flag).toEqual(["f1"])
    expect(out[1].Tasks[1].Flag).toEqual([])
  })

  it("unlinks a variant whose base is gone", () => {
    const linked = variant("l", 1, [task("t1", "One", ["f1"])], "gone")
    const out = syncLinkedVariants([linked])
    expect(out[0].LinkedTo).toBe("")
    expect(out[0].Tasks[0].Name).toBe("One")
  })

  it("leaves a link to itself or to a linked variant untouched", () => {
    const a = variant("a", 1, [task("t1", "A")])
    const b = variant("b", 2, [task("t1", "B")], "a")
    const c = variant("c", 3, [task("t1", "C")], "b")
    const self = variant("s", 4, [task("t1", "S")], "s")
    const out = syncLinkedVariants([a, b, c, self])
    expect(out[2]).toBe(c)
    expect(out[3]).toBe(self)
    expect(out[1].Tasks[0].Name).toBe("A")
  })

  it("unlinks a missing base first, so a variant linked to it can still be rebuilt (A to B, B to gone)", () => {
    const a = variant("a", 1, [task("t1", "A", ["fa"])], "b")
    const b = variant("b", 2, [task("t1", "B")], "gone")
    const out = syncLinkedVariants([a, b])
    expect(out[1].LinkedTo).toBe("")
    expect(out[0].LinkedTo).toBe("b")
    expect(out[0].Tasks[0].Name).toBe("B")
    expect(out[0].Tasks[0].Flag).toEqual(["fa"])
    expect(syncLinkedVariants(out)).toEqual(out)
    expect(syncLinkedVariants(syncLinkedVariants([a, b]))).toEqual(out)
  })

  it("does not mutate its input", () => {
    const base = variant("b", 1, [task("t1", "Base")])
    const linked = variant("l", 2, [task("t1", "Old", ["x"])], "b")
    const snapshot = JSON.stringify([base, linked])
    syncLinkedVariants([base, linked])
    expect(JSON.stringify([base, linked])).toBe(snapshot)
  })
})

describe("copyVariant", () => {
  it("is deep, unlinked, and remembers its source id", () => {
    const source = variant("s", 1, [task("t1", "One", ["f"])], "base")
    source.Topology.Devices = [{ ...emptyDevice(), ID: "d1", Name: "web" }]
    const copy = copyVariant(source, 5)
    expect(copy.ID).toBe("")
    expect(copy.Index).toBe(5)
    expect(copy.LinkedTo).toBe("")
    expect(copy.CopyOf).toBe("s")
    expect(copy.Tasks[0].ID).toBe("t1")
    expect(copy.Topology.Devices[0].ID).toBe("d1")
    copy.Topology.Devices[0].Name = "changed"
    copy.Tasks[0].Hints[0].Text = "changed"
    expect(source.Topology.Devices[0].Name).toBe("web")
    expect(source.Tasks[0].Hints[0].Text).toBe("hint One")
  })

  it("omits CopyOf for an unsaved source", () => {
    expect(copyVariant(variant("", 1, [task("t1", "One")]), 2).CopyOf).toBeUndefined()
  })
})

describe("newLinkedVariant", () => {
  it("has the base structure with the given flags, files and note", () => {
    const base = variant("b", 1, [task("t1", "One", ["base"], ["base.txt"]), task("t2", "Two")])
    const created = newLinkedVariant(base, 3, {
      Note: "n",
      Tasks: [
        { Flag: ["a"], Attachments: [{ FileID: "f", Name: "f" }] },
        { Flag: ["b"], Attachments: [] },
      ],
    })
    expect(created.ID).toBe("")
    expect(created.Index).toBe(3)
    expect(created.LinkedTo).toBe("b")
    expect(created.Note).toBe("n")
    expect(created.Tasks.map((x) => x.Name)).toEqual(["One", "Two"])
    expect(created.Tasks[0].Flag).toEqual(["a"])
    expect(created.Tasks[0].Attachments[0].FileID).toBe("f")
    expect(created.Tasks[1].Flag).toEqual(["b"])
    expect(base.Tasks[0].Flag).toEqual(["base"])
  })
})

describe("baseCandidates and dependentsOf", () => {
  it("baseCandidates skips unsaved and linked variants", () => {
    const vs = [variant("a", 1, [task("t", "A")]), variant("", 2, [task("t", "B")]), variant("c", 3, [task("t", "C")], "a")]
    expect(baseCandidates(vs)).toEqual([0])
  })
  it("dependentsOf lists the variants linked to a base", () => {
    const vs = [variant("a", 1, [task("t", "A")]), variant("b", 2, [task("t", "B")], "a"), variant("c", 3, [task("t", "C")], "x")]
    expect(dependentsOf(vs, "a")).toEqual([1])
    expect(dependentsOf(vs, "")).toEqual([])
  })
})

describe("linkedFlagConflicts", () => {
  it("reports the duplicate in a linked variant but not across independent variants or for templates", () => {
    const base = variant("b", 1, [task("t1", "One", ["same", "template:x"]), task("t2", "Two", ["u"])])
    const linked = variant("l", 2, [task("t1", "One", ["same", "template:x"]), task("t2", "Two", ["v", ""])], "b")
    const indep = variant("i", 3, [task("t1", "One", ["same"]), task("t2", "Two", ["u"])])
    expect(linkedFlagConflicts([base, linked, indep])).toEqual([{ variantIndex: 1, taskIndex: 0 }])
  })
  it("skips empty flag values shared by a base and a linked variant", () => {
    const base = variant("b", 1, [task("t1", "One", [""])])
    const linked = variant("l", 2, [task("t1", "One", [""])], "b")
    expect(linkedFlagConflicts([base, linked])).toEqual([])
  })
  it("does not report a repeat inside one variant and reports each later linked variant", () => {
    const base = variant("b", 1, [task("t1", "One", ["x", "x"])])
    const l1 = variant("l1", 2, [task("t1", "One", ["y"])], "b")
    const l2 = variant("l2", 3, [task("t1", "One", ["y"])], "b")
    expect(linkedFlagConflicts([base, l1, l2])).toEqual([{ variantIndex: 2, taskIndex: 0 }])
  })
})
