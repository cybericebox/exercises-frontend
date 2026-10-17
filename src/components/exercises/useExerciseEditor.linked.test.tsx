import { useLayoutEffect } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, render, screen } from "@testing-library/react"
import { useFieldArray } from "react-hook-form"
import type { Exercise } from "@/api/exercises/catalog"
import type { Version } from "@/api/exercises/versions"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock("@/api/exercises/catalog", () => ({
  createExercise: vi.fn(), getExercise: vi.fn(), updateExercise: vi.fn(), updateExerciseKeepalive: vi.fn(),
}))
vi.mock("@/api/exercises/versions", () => ({
  isStoredVersionId: (id: string) => id !== "",
  getDraft: vi.fn(), getVersion: vi.fn(), saveDraft: vi.fn(), saveDraftKeepalive: vi.fn(),
}))

import { getExercise } from "@/api/exercises/catalog"
import { getDraft, saveDraft } from "@/api/exercises/versions"
import { emptyTask, type DraftFormValues } from "@/lib/exerciseSchemas"
import { OWNERSHIP } from "@/test/exerciseFixtures"
import { useExerciseEditor, type ExerciseEditor } from "./useExerciseEditor"
import { useLinkedVariantSync } from "./useLinkedVariantSync"

const exercise: Exercise = {
  ...OWNERSHIP,
  ID: "ex-1", Name: "Web 101", Description: "", Tags: [], DraftVersionID: "draft-1", PublishedVersionID: null,
  ArchivedAt: null, HasChanges: true, CreatedAt: "", CreatedBy: null, UpdatedAt: "", UpdatedBy: null,
}

function variant(id: string, index: number, flag: string, linkedTo = ""): Version["Variants"][number] {
  return { ID: id, Index: index, Note: "", LinkedTo: linkedTo, Tasks: [{ ID: "task-1", Name: "Find the flag", Description: null,
    Difficulty: "easy", Flag: [flag], LinkedDeviceID: "", DeviceFlagVar: "", Attachments: [], Placeholders: [], Hints: [] }],
    Topology: { VPN: { Enabled: false, DHCP: true }, Internet: { Enabled: false, DHCP: true }, Devices: [], Connections: [], VisualRender: null } }
}

const version: Version = {
  ID: "draft-1", ExerciseID: "ex-1", Status: "draft", AdminNote: "", Label: "", CreatedAt: "", CreatedBy: null, PublishedAt: null, Resources: null, Elevation: null,
  Variants: [variant("base", 1, "ICE{base}"), variant("linked", 2, "ICE{own}", "base")],
}

/** The daemon's answer: every new task and hint gets an id, a linked copy the same ids as its base. */
function savedWithIds(values: DraftFormValues): Version {
  const variants = structuredClone(values.Variants)
  for (const item of variants) {
    item.Tasks.forEach((task, ti) => {
      if (!task.ID) task.ID = `task-new-${ti}`
      task.Hints.forEach((hint, hi) => { if (!hint.ID) hint.ID = `hint-new-${ti}-${hi}` })
    })
  }
  return { ...version, Variants: variants as unknown as Version["Variants"] }
}

let latest: ExerciseEditor
let linkedFieldIds: string[] = []

function LinkedTab({ editor }: { editor: ExerciseEditor }) {
  const { fields } = useFieldArray({ control: editor.draftForm.control, name: "Variants.1.Tasks" })
  // A mounted linked subtask input (TaskForm registers its inputs like this).
  editor.draftForm.register("Variants.1.Tasks.0.Name")
  useLayoutEffect(() => { linkedFieldIds = fields.map((field) => field.id) })
  return null
}

function Harness() {
  const editor = useExerciseEditor({
    exerciseId: "ex-1", versionId: null, editable: true, canWrite: true, userId: "editor-1",
    onCreated: vi.fn(), onPendingRestored: vi.fn(),
  })
  useLinkedVariantSync(editor.draftForm, editor.loadState === "ready")
  useLayoutEffect(() => { latest = editor })
  if (editor.loadState !== "ready") return <p>loading</p>
  return <><p>ready</p><LinkedTab editor={editor} /></>
}

async function addBaseTasks(tasks: DraftFormValues["Variants"][number]["Tasks"]) {
  render(<Harness />)
  await screen.findByText("ready")
  await act(async () => {})
  await act(async () => { latest.draftForm.setValue("Variants.0.Tasks", [...latest.draftForm.getValues("Variants.0.Tasks"), ...tasks], { shouldDirty: true }) })
  expect(latest.draftForm.getValues("Variants.1.Tasks")).toHaveLength(1 + tasks.length)
  const mounted = linkedFieldIds
  await act(async () => { await latest.autosave.flush() })
  expect(saveDraft).toHaveBeenCalledTimes(1)
  return mounted
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getExercise).mockResolvedValue(exercise)
  vi.mocked(getDraft).mockResolvedValue(version)
  vi.mocked(saveDraft).mockImplementation(async () => savedWithIds(latest.draftForm.getValues()))
})

describe("useExerciseEditor with a linked variant", () => {
  it("keeps the linked subtask form mounted when a save gives two new base tasks their ids", async () => {
    const mounted = await addBaseTasks([{ ...emptyTask(), Name: "Second" }, { ...emptyTask(), Name: "Third" }])
    expect(latest.draftForm.getValues("Variants.0.Tasks").map((task) => task.ID)).toEqual(["task-1", "task-new-1", "task-new-2"])
    expect(latest.draftForm.getValues("Variants.1.Tasks").map((task) => task.ID)).toEqual(["task-1", "task-new-1", "task-new-2"])
    expect(linkedFieldIds).toEqual(mounted)
  })

  it("keeps the linked subtask form mounted when a save gives a new base task and its hint ids", async () => {
    const mounted = await addBaseTasks([{ ...emptyTask(), Name: "Second", Hints: [{ ID: "", Text: "Look closer", Level: "nudge" }] }])
    expect(latest.draftForm.getValues("Variants.0.Tasks.1.Hints.0.ID")).toBe("hint-new-1-0")
    expect(latest.draftForm.getValues("Variants.1.Tasks.1.Hints.0.ID")).toBe("hint-new-1-0")
    expect(linkedFieldIds).toEqual(mounted)
  })
})
