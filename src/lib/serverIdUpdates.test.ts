import { describe, expect, it } from "vitest"
import type { Version } from "@/api/exercises/versions"
import { emptyDraft, emptyTask, toDraftFormValues } from "@/lib/exerciseSchemas"
import { capturedDraftIds, serverIdUpdates } from "./serverIdUpdates"

function savedFrom(form: ReturnType<typeof emptyDraft>, ids: { variant: string; tasks: string[] }): Version {
  const values = structuredClone(form)
  values.Variants[0].ID = ids.variant
  values.Variants[0].Tasks.forEach((task, i) => { task.ID = ids.tasks[i] })
  return {
    ID: "draft-1", ExerciseID: "e1", Status: "draft", AdminNote: "", Label: "", CreatedAt: "", CreatedBy: null, PublishedAt: null,
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
})
