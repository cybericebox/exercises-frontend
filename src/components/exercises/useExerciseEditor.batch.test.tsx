import { useLayoutEffect } from "react"
import { describe, expect, it, vi } from "vitest"
import { act, render, screen } from "@testing-library/react"
import type { Exercise } from "@/api/exercises/catalog"
import type { Version } from "@/api/exercises/versions"

const autosave = vi.hoisted(() => ({
  status: "idle" as const,
  markChanged: vi.fn(),
  flush: vi.fn(async () => true),
  hasUnsaved: () => false,
  discard: vi.fn(async () => undefined),
}))

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock("./useExerciseAutosave", () => ({ useExerciseAutosave: () => autosave }))
vi.mock("@/api/exercises/catalog", () => ({
  createExercise: vi.fn(), getExercise: vi.fn(), updateExercise: vi.fn(), updateExerciseKeepalive: vi.fn(),
}))
vi.mock("@/api/exercises/versions", () => ({
  isStoredVersionId: (id: string) => id !== "",
  getDraft: vi.fn(), getVersion: vi.fn(), saveDraft: vi.fn(), saveDraftKeepalive: vi.fn(),
}))

import { getExercise } from "@/api/exercises/catalog"
import { getDraft } from "@/api/exercises/versions"
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
  Variants: [variant("base", 1, "ICE{base}"), variant("l1", 2, "ICE{l1}", "base"), variant("l2", 3, "ICE{l2}", "base"), variant("l3", 4, "ICE{l3}", "base")],
}

let latest: ExerciseEditor

function Harness() {
  const editor = useExerciseEditor({
    exerciseId: "ex-1", versionId: null, editable: true, canWrite: true, userId: "editor-1",
    onCreated: vi.fn(), onPendingRestored: vi.fn(),
  })
  useLinkedVariantSync(editor.draftForm, editor.loadState === "ready")
  useLayoutEffect(() => { latest = editor })
  return <p>{editor.loadState}</p>
}

describe("useExerciseEditor with linked variants", () => {
  it("marks one change for a keystroke in a base with linked variants", async () => {
    vi.mocked(getExercise).mockResolvedValue(exercise)
    vi.mocked(getDraft).mockResolvedValue(version)
    render(<Harness />)
    await screen.findByText("ready")
    await act(async () => {})
    autosave.markChanged.mockClear()
    await act(async () => { latest.draftForm.setValue("Variants.0.Tasks.0.Name", "Renamed", { shouldDirty: true }) })
    expect(latest.draftForm.getValues("Variants.3.Tasks.0.Name")).toBe("Renamed")
    expect(autosave.markChanged).toHaveBeenCalledTimes(1)
  })
})
