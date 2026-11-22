import { describe, expect, it } from "vitest"
import { emptyDevice, emptyDraft, emptyVariant, toSaveDraftInput } from "@/lib/exerciseSchemas"
import { emptyBootstrap } from "@/lib/editor/schemas/infra"
import { formTask } from "@/test/editorFixtures"
import { syncLinkedVariants } from "@/lib/linkedVariants"
import { clientKeyFills, ensureClientKeys } from "./clientKeys"

function draft() {
  const value = emptyDraft()
  value.Variants[0].ID = "v1"
  value.Variants[0].Tasks = [formTask({ ID: "t1" }), formTask({ Name: "new" })]
  value.Variants[0].Topology.Devices = [{ ...emptyDevice(), ID: "d1", Bootstrap: { ...emptyBootstrap(), Env: [{ Name: "A", Value: "1", Secret: false, HasValue: false }] } }]
  return value
}

describe("client keys", () => {
  it("gives every variant, task, device and variable row a key and keeps the ones it has", () => {
    const value = draft()
    value.Variants[0].Tasks[0].ClientKey = "kept"
    const keyed = ensureClientKeys(value)
    const variant = keyed.Variants[0]
    expect(variant.ClientKey).toEqual(expect.any(String))
    expect(variant.Tasks.map((task) => task.ClientKey)).toEqual(["kept", expect.any(String)])
    expect(variant.Topology.Devices[0].ClientKey).toEqual(expect.any(String))
    expect(variant.Topology.Devices[0].Bootstrap.Env[0].ClientKey).toEqual(expect.any(String))
    expect(clientKeyFills(keyed)).toEqual([])
  })

  it("gives a copy (the same key twice in one list) a new key, the first one keeps its key", () => {
    const value = ensureClientKeys(draft())
    value.Variants[0].Tasks.push({ ...value.Variants[0].Tasks[0] })
    value.Variants.push({ ...structuredClone(value.Variants[0]), ID: "" })
    const fills = clientKeyFills(value)
    expect(fills.map((fill) => fill.path)).toEqual(["Variants.0.Tasks.2.ClientKey", "Variants.1.ClientKey", "Variants.1.Tasks.2.ClientKey"])
  })

  it("never sends the client key to the server", () => {
    expect(JSON.stringify(toSaveDraftInput(ensureClientKeys(draft())))).not.toContain("ClientKey")
  })

  it("a linked variant keeps its own key when it is rebuilt from its base", () => {
    const value = ensureClientKeys(draft())
    const linked = { ...emptyVariant(2), ID: "v2", LinkedTo: "v1", ClientKey: "linked-key" }
    const rebuilt = syncLinkedVariants([value.Variants[0], linked])
    expect(rebuilt[1].ClientKey).toBe("linked-key")
  })
})
