import { describe, expect, it } from "vitest"
import type { Version } from "@/api/exercises/versions"
import { emptyDevice, emptyDraft, emptyTask, toDraftFormValues } from "@/lib/exerciseSchemas"
import { capturedDraftIds, savedSecretUpdates, serverIdUpdates } from "./serverIdUpdates"

function savedFrom(form: ReturnType<typeof emptyDraft>, ids: { variant: string; tasks: string[] }): Version {
  const values = structuredClone(form)
  values.Variants[0].ID = ids.variant
  values.Variants[0].Tasks.forEach((task, i) => { task.ID = ids.tasks[i] })
  return {
    ID: "draft-1", ExerciseID: "e1", Status: "draft", AdminNote: "", Label: "", CreatedAt: "", CreatedBy: null, PublishedAt: null, Resources: null, Elevation: null,
    Variants: values.Variants.map((variant) => ({ ...variant, Topology: { ...variant.Topology, Devices: [] } })),
  }
}

describe("serverIdUpdates", () => {
  it("adopts IDs for new variants and tasks only", () => {
    const form = emptyDraft()
    form.Variants[0].Tasks.push({ ...emptyTask(), ID: "t-existing" })
    const sent = capturedDraftIds(form)
    const saved = savedFrom(form, { variant: "v1", tasks: ["t1", "t-existing"] })
    expect(serverIdUpdates(sent, saved, form)).toEqual([
      { path: "Variants.0.ID", value: "v1" },
      { path: "Variants.0.Tasks.0.ID", value: "t1" },
    ])
  })

  it("lists linked variants' ids before their base's", () => {
    const form = emptyDraft()
    form.Variants[0].ID = "base"
    form.Variants[0].Tasks[0].ID = ""
    form.Variants.push({ ...structuredClone(form.Variants[0]), ID: "linked", Index: 2, LinkedTo: "base" })
    const sent = capturedDraftIds(form)
    const saved = savedFrom(form, { variant: "base", tasks: ["t1"] })
    saved.Variants[1].Tasks[0].ID = "t1"
    expect(serverIdUpdates(sent, saved, form)).toEqual([
      { path: "Variants.1.Tasks.0.ID", value: "t1" },
      { path: "Variants.0.Tasks.0.ID", value: "t1" },
    ])
  })

  it("adopts nothing when the form structure changed while saving (task count changed)", () => {
    const form = emptyDraft()
    const sent = capturedDraftIds(form)
    const saved = savedFrom(form, { variant: "v1", tasks: ["t1"] })
    form.Variants[0].Tasks.push(emptyTask())
    expect(serverIdUpdates(sent, saved, form)).toEqual([])
  })

  it("returns nothing when every ID is already known", () => {
    const saved = savedFrom(emptyDraft(), { variant: "v1", tasks: ["t1"] })
    const form = toDraftFormValues(saved)
    const sent = capturedDraftIds(form)
    expect(serverIdUpdates(sent, saved, form)).toEqual([])
  })

  it("adopts nothing when a task is deleted and a different one added during the save (same count)", () => {
    // Sent: task0 existing "t-old", task1 new (""). Server assigns "t-old" (unchanged) and "t-new" for task1.
    const form = emptyDraft()
    form.Variants[0].ID = "v1"
    form.Variants[0].Tasks[0] = { ...emptyTask(), ID: "t-old" }
    form.Variants[0].Tasks.push(emptyTask())
    const sent = capturedDraftIds(form)
    const saved = savedFrom(form, { variant: "v1", tasks: ["t-old", "t-new"] })
    // Concurrently: the user deleted task0 ("t-old") and added a different new task, so the
    // current form's task ID sequence ("", "") no longer matches what was sent ("t-old", "").
    form.Variants[0].Tasks = [emptyTask(), emptyTask()]
    expect(serverIdUpdates(sent, saved, form)).toEqual([])
  })

  it("adopts nothing when a variant is deleted and a different one added during the save (same count)", () => {
    // Sent: variant0 existing "v-old". Server confirms "v-old" and assigns a real ID to a would-be new variant2 (not present here).
    const form = emptyDraft()
    form.Variants[0].ID = "v-old"
    const sent = capturedDraftIds(form)
    const saved = savedFrom(form, { variant: "v-old", tasks: ["t1"] })
    // Concurrently: the user deleted the "v-old" variant and added a brand-new one in its place.
    form.Variants[0] = { ...form.Variants[0], ID: "" }
    expect(serverIdUpdates(sent, saved, form)).toEqual([])
  })

  it("adopts server-assigned hint IDs so later saves keep them", () => {
    const form = emptyDraft()
    form.Variants[0].ID = "v1"
    form.Variants[0].Tasks[0].ID = "t1"
    form.Variants[0].Tasks[0].Hints = [{ ID: "h-old", Text: "a", Level: "nudge" }, { ID: "", Text: "b", Level: "steps" }]
    const sent = capturedDraftIds(form)
    const saved = savedFrom(form, { variant: "v1", tasks: ["t1"] })
    saved.Variants[0].Tasks[0].Hints = [{ ID: "h-old", Text: "a", Level: "nudge" }, { ID: "h-new", Text: "b", Level: "steps" }]
    expect(serverIdUpdates(sent, saved, form)).toEqual([{ path: "Variants.0.Tasks.0.Hints.1.ID", value: "h-new" }])
  })

  it("skips hint IDs when the hints changed while saving", () => {
    const form = emptyDraft()
    form.Variants[0].ID = "v1"
    form.Variants[0].Tasks[0].ID = "t1"
    form.Variants[0].Tasks[0].Hints = [{ ID: "", Text: "a", Level: "nudge" }]
    const sent = capturedDraftIds(form)
    const saved = savedFrom(form, { variant: "v1", tasks: ["t1"] })
    saved.Variants[0].Tasks[0].Hints = [{ ID: "h1", Text: "a", Level: "nudge" }]
    form.Variants[0].Tasks[0].Hints = [{ ID: "", Text: "new", Level: "nudge" }, { ID: "", Text: "a", Level: "nudge" }]
    expect(serverIdUpdates(sent, saved, form)).toEqual([])
  })
})

describe("savedSecretUpdates", () => {
  function setup(group?: number) {
    const form = emptyDraft()
    form.Variants[0].ID = "v1"
    form.Variants[0].Topology.Devices = [{ ...emptyDevice(), ID: "d1", Name: "web",
      EnvVars: [{ Name: "MODE", Value: "ctf", Secret: false, HasValue: false }, { Name: "FLAG", Value: "typed", Secret: true, HasValue: false }] }]
    const saved = savedFrom(form, { variant: "v1", tasks: [""] })
    saved.Variants[0].Topology.Devices = [{ ...form.Variants[0].Topology.Devices[0], External: null,
      EnvVars: [{ Name: "MODE", Value: "ctf", Secret: false, HasValue: false }, { Name: "FLAG", Value: "", Secret: true, HasValue: true, ...(group ? { ValueGroup: group } : {}) }] }]
    return { form, saved, sent: capturedDraftIds(form) }
  }

  it("clears the sent secret and adopts its group from the answer", () => {
    const { form, saved, sent } = setup(1)
    expect(sent.secrets).toEqual([{ variant: 0, deviceId: "d1", name: "FLAG", value: "typed" }])
    expect(savedSecretUpdates(sent, saved, form)).toEqual([
      { path: "Variants.0.Topology.Devices.0.EnvVars.1.Value", value: "" },
      { path: "Variants.0.Topology.Devices.0.EnvVars.1.HasValue", value: true },
      { path: "Variants.0.Topology.Devices.0.EnvVars.1.ValueGroup", value: 1 },
    ])
  })

  it("re-reads every stored secret's group from the answer, so all groups come from one response", () => {
    const { form, saved, sent } = setup(3)
    form.Variants[0].Topology.Devices[0].EnvVars[1] = { Name: "FLAG", Value: "", Secret: true, HasValue: true, ValueGroup: 7 }
    expect(savedSecretUpdates(sent, saved, form)).toEqual([{ path: "Variants.0.Topology.Devices.0.EnvVars.1.ValueGroup", value: 3 }])
    // Already the answer's group: nothing to write.
    form.Variants[0].Topology.Devices[0].EnvVars[1].ValueGroup = 3
    expect(savedSecretUpdates(sent, saved, form)).toEqual([])
  })

  it("keeps a value typed further typed and without a group; an older server gives no group; a changed variant sequence changes nothing", () => {
    const typedFurther = setup(1)
    typedFurther.form.Variants[0].Topology.Devices[0].EnvVars[1].Value = "typed more"
    expect(savedSecretUpdates(typedFurther.sent, typedFurther.saved, typedFurther.form)).toEqual([])
    const older = setup()
    expect(savedSecretUpdates(older.sent, older.saved, older.form)).toEqual([
      { path: "Variants.0.Topology.Devices.0.EnvVars.1.Value", value: "" },
      { path: "Variants.0.Topology.Devices.0.EnvVars.1.HasValue", value: true },
    ])
    const reordered = setup(1)
    reordered.form.Variants[0].ID = "other"
    expect(savedSecretUpdates(reordered.sent, reordered.saved, reordered.form)).toEqual([])
  })
})
