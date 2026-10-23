import { StrictMode, useLayoutEffect } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { ApiError } from "@/api/client"
import type { Exercise } from "@/api/exercises/catalog"
import type { Version } from "@/api/exercises/versions"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock("@/api/exercises/catalog", () => ({
  createExercise: vi.fn(), getExercise: vi.fn(), updateExercise: vi.fn(), updateExerciseKeepalive: vi.fn(),
}))
vi.mock("@/api/exercises/versions", () => ({
  EMPTY_VERSION_ID: "00000000-0000-0000-0000-000000000000",
  isStoredVersionId: (id: string) => id !== "" && id !== "00000000-0000-0000-0000-000000000000",
  getDraft: vi.fn(), getVersion: vi.fn(), saveDraft: vi.fn(), saveDraftKeepalive: vi.fn(),
}))

import { createExercise, getExercise, updateExercise } from "@/api/exercises/catalog"
import { getDraft, getVersion, saveDraft, saveDraftKeepalive } from "@/api/exercises/versions"
import { toast } from "@/components/ui/toast"
import { pendingBufferKey, writePendingChanges } from "@/lib/exercisePendingBuffer"
import { emptyDevice, emptyDraft, emptyTask, toDraftFormValues } from "@/lib/exerciseSchemas"
import { useExerciseEditor, type ExerciseEditor, type UseExerciseEditorOptions } from "./useExerciseEditor"
import { OWNERSHIP } from "@/test/exerciseFixtures"

const mockCreate = vi.mocked(createExercise)
const mockGetExercise = vi.mocked(getExercise)
const mockUpdate = vi.mocked(updateExercise)
const mockGetDraft = vi.mocked(getDraft)
const mockGetVersion = vi.mocked(getVersion)
const mockSaveDraft = vi.mocked(saveDraft)

const exercise: Exercise = {
  ...OWNERSHIP,
  ID: "ex-1", Name: "Web 101", Description: "", Tags: [], DraftVersionID: "draft-1", PublishedVersionID: null,
  ArchivedAt: null, HasChanges: true, CreatedAt: "", CreatedBy: null, UpdatedAt: "", UpdatedBy: null,
}
const created: Exercise = { ...exercise, ID: "new-exercise", Name: "Buffer overflow", DraftVersionID: null }
const serverVersion: Version = {
  ID: "draft-1", ExerciseID: "ex-1", Status: "draft", AdminNote: "", Label: "", CreatedAt: "", CreatedBy: null, PublishedAt: null, Resources: null, Elevation: null,
  Variants: [{ ID: "variant-1", Index: 1, Note: "", Weight: 1, LinkedTo: "", Tasks: [{ ID: "task-1", Name: "Find the flag", Description: null,
    Difficulty: "easy", Flag: ["ICE{server}"], LinkedDeviceID: "", DeviceFlagVar: "", Attachments: [], Placeholders: [], Hints: [] }],
    Topology: { VPN: { Enabled: false, DHCP: true }, Internet: { Enabled: false, DHCP: true }, Devices: [], Connections: [], VisualRender: null } }],
}

let latest: ExerciseEditor
let storage: Map<string, string>

function Harness(props: Partial<UseExerciseEditorOptions>) {
  const editor = useExerciseEditor({
    exerciseId: null, versionId: null, editable: true, canWrite: true, userId: "editor-1",
    onCreated: vi.fn(), onPendingRestored: vi.fn(), ...props,
  })
  // Reassigning a module-scope variable during render is impure; capture it in a
  // layout effect instead — it runs within the commit, so it is current as soon as
  // findBy* sees the new DOM (a passive effect may still be pending at that point).
  useLayoutEffect(() => { latest = editor })
  if (editor.loadState === "notFound") return <p>not found</p>
  if (editor.loadState === "error") return <button onClick={editor.retryLoad}>retry</button>
  if (editor.loadState !== "ready") return <p>loading</p>
  return <form>
    <input aria-label="name" {...editor.identityForm.register("Name")} />
    <span data-testid="status">{editor.autosave.status}</span>
  </form>
}

beforeEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  storage = new Map()
  Object.defineProperty(window, "localStorage", { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, String(value)) },
    removeItem: (key: string) => { storage.delete(key) },
    clear: () => { storage.clear() },
  } })
  mockCreate.mockResolvedValue(created)
  mockGetExercise.mockResolvedValue(exercise)
  mockUpdate.mockImplementation(async (_id, input) => ({ ...exercise, ...input }))
  mockGetDraft.mockResolvedValue(serverVersion)
  mockSaveDraft.mockResolvedValue(serverVersion)
})

describe("useExerciseEditor", () => {
  it.each([null, "history-1"])("hydrates selected version identity including empty values (%s)", async (versionId) => {
    const selected = { ...serverVersion, Name: "Selected snapshot", Description: "", Tags: [] }
    mockGetExercise.mockResolvedValue({ ...exercise, Description: "Public description", Tags: ["public"] })
    mockGetDraft.mockResolvedValue(selected)
    mockGetVersion.mockResolvedValue(selected)
    render(<Harness exerciseId="ex-1" versionId={versionId} editable={!versionId} />)
    await screen.findByDisplayValue("Selected snapshot")
    expect(latest.identityForm.getValues()).toEqual({ Name: "Selected snapshot", Description: "", Tags: [] })
  })

  it("uses published identity for published-only readers", async () => {
    mockGetExercise.mockResolvedValue({ ...exercise, PublishedVersionID: "pub-1" })
    mockGetVersion.mockResolvedValue({ ...serverVersion, Name: "Published name", Description: "Published description", Tags: ["published"] })
    render(<Harness exerciseId="ex-1" publishedOnly={() => true} />)
    await screen.findByDisplayValue("Published name")
    expect(latest.identityForm.getValues("Description")).toBe("Published description")
  })

  it("advances the authoritative draft ID on metadata-only PATCH and rejects a late card regression", async () => {
    let refresh: (value: Exercise) => void = () => undefined
    mockGetExercise.mockResolvedValueOnce(exercise).mockReturnValueOnce(new Promise((resolve) => { refresh = resolve }))
    mockUpdate.mockResolvedValue({ ...exercise, Name: "New metadata", DraftVersionID: "draft-2", HasChanges: true })
    render(<Harness exerciseId="ex-1" />)
    await screen.findByDisplayValue("Web 101")
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "New metadata" } })
    await act(async () => { await latest.autosave.flush() })
    expect(mockSaveDraft).not.toHaveBeenCalled()
    expect(latest.getDraftVersionId()).toBe("draft-2")
    await act(async () => { refresh({ ...exercise, HasChanges: false }) })
    expect(latest.exercise?.DraftVersionID).toBe("draft-2")
    expect(latest.exercise?.HasChanges).toBe(true)
  })

  it("preserves edits made during metadata PATCH and sends only acknowledged snapshots", async () => {
    let acknowledge: (value: Exercise) => void = () => undefined
    mockUpdate.mockReturnValueOnce(new Promise((resolve) => { acknowledge = resolve }))
    render(<Harness exerciseId="ex-1" />)
    await screen.findByDisplayValue("Web 101")
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "First metadata" } })
    let flushed: Promise<boolean>
    act(() => { flushed = latest.autosave.flush() })
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Newer metadata" } })
    expect(screen.getByLabelText("name")).toBeEnabled()
    await act(async () => { acknowledge({ ...exercise, Name: "First metadata", DraftVersionID: "draft-2" }); await flushed })
    expect(mockUpdate).toHaveBeenLastCalledWith("ex-1", { Name: "Newer metadata", Description: "", Tags: [] })
    expect(latest.identityForm.getValues("Name")).toBe("Newer metadata")
  })

  it("reloads restored working-copy identity from the returned draft snapshot", async () => {
    render(<Harness exerciseId="ex-1" />)
    await screen.findByDisplayValue("Web 101")
    mockGetDraft.mockResolvedValue({ ...serverVersion, ID:"restored-draft", Name:"Restored metadata", Description:"", Tags:[] })
    mockGetExercise.mockResolvedValue({ ...exercise, Name:"Public metadata", Description:"Public text", Tags:["public"] })
    await act(async () => { await latest.reloadWorkingCopy() })
    expect(latest.identityForm.getValues()).toEqual({ Name:"Restored metadata", Description:"", Tags:[] })
    expect(latest.getDraftVersionId()).toBe("restored-draft")
  })

  it("does not let a late card refresh undo a newer acknowledged save", async () => {
    let refresh: (value: Exercise) => void = () => undefined
    mockGetExercise.mockResolvedValueOnce(exercise).mockReturnValueOnce(new Promise((resolve) => { refresh = resolve })).mockResolvedValue(exercise)
    mockUpdate.mockResolvedValueOnce({ ...exercise, DraftVersionID:"draft-2", Name:"First metadata" }).mockResolvedValueOnce({ ...exercise, DraftVersionID:"draft-3", Name:"Latest metadata", HasChanges:true })
    render(<Harness exerciseId="ex-1" />)
    await screen.findByDisplayValue("Web 101")
    fireEvent.change(screen.getByLabelText("name"), { target:{ value:"First metadata" } })
    await act(async () => { await latest.autosave.flush() })
    fireEvent.change(screen.getByLabelText("name"), { target:{ value:"Latest metadata" } })
    await act(async () => { await latest.autosave.flush() })
    await act(async () => { refresh({ ...exercise, DraftVersionID:"draft-2", HasChanges:false }) })
    expect(latest.identityForm.getValues("Name")).toBe("Latest metadata")
    expect(latest.getDraftVersionId()).toBe("draft-3")
    expect(latest.exercise?.DraftVersionID).toBe("draft-3")
    expect(latest.exercise?.HasChanges).toBe(true)
  })

  it("does not PUT a draft when an edit is reverted before the debounce drains", async () => {
    render(<Harness exerciseId="ex-1" />)
    await screen.findByDisplayValue("Web 101")
    await act(async () => {})
    vi.useFakeTimers()
    act(() => latest.draftForm.setValue("AdminNote", "temporary note"))
    // Settle the change check: the edit is marked, so the save reaches the payload comparison.
    await act(async () => {})
    expect(latest.autosave.hasUnsaved()).toBe(true)
    act(() => latest.draftForm.setValue("AdminNote", ""))
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(mockSaveDraft).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(latest.autosave.hasUnsaved()).toBe(false)
    expect(storage.has(pendingBufferKey("editor-1", "ex-1"))).toBe(false)
  })

  it("skips a draft PUT for identity-only edits but still persists a real draft change", async () => {
    render(<Harness exerciseId="ex-1" />)
    await screen.findByDisplayValue("Web 101")
    await act(async () => {})
    vi.useFakeTimers()
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Web 102" } })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(mockUpdate).toHaveBeenCalledWith("ex-1", { Name: "Web 102", Description: "", Tags: [] })
    expect(mockSaveDraft).not.toHaveBeenCalled()
    act(() => latest.draftForm.setValue("AdminNote", "real note"))
    await act(async () => { await latest.autosave.flush() })
    expect(mockSaveDraft).toHaveBeenCalledWith("ex-1", expect.objectContaining({ AdminNote: "real note" }))
  })

  it("reverts against the acknowledged in-flight draft, not the latest observed local values", async () => {
    let resolve: (value: Version) => void = () => undefined
    mockSaveDraft.mockReturnValueOnce(new Promise((done) => { resolve = done }))
    render(<Harness exerciseId="ex-1" />)
    await screen.findByDisplayValue("Web 101")
    await act(async () => {})
    vi.useFakeTimers()
    act(() => latest.draftForm.setValue("AdminNote", "sent note"))
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    act(() => latest.draftForm.setValue("AdminNote", ""))
    await act(async () => resolve({ ...serverVersion, AdminNote: "sent note" }))
    expect(mockSaveDraft).toHaveBeenCalledTimes(2)
    expect(mockSaveDraft).toHaveBeenLastCalledWith("ex-1", expect.objectContaining({ AdminNote: "" }))
    expect(latest.draftForm.getValues("AdminNote")).toBe("")
    expect(latest.autosave.hasUnsaved()).toBe(false)
  })

  it("flushes an edit made in the same tick as the unmount", async () => {
    const { unmount } = render(<Harness exerciseId="ex-1" />)
    await screen.findByDisplayValue("Web 101")
    await act(async () => {})
    vi.useFakeTimers()
    act(() => {
      latest.draftForm.setValue("AdminNote", "last words")
      unmount()
    })
    await act(async () => {})
    expect(mockSaveDraft).toHaveBeenCalledWith("ex-1", expect.objectContaining({ AdminNote: "last words" }))
  })

  it("uses the same canonical payload for no-op pagehide and subsequent drain", async () => {
    render(<Harness exerciseId="ex-1" />)
    await screen.findByDisplayValue("Web 101")
    await act(async () => {})
    vi.useFakeTimers()
    // The form sees a change the canonical payload does not (Index is renumbered by position).
    // A key-order-only edit cannot be used here: react-hook-form drops a deep-equal setValue.
    act(() => latest.draftForm.setValue("Variants.0.Index", 7))
    await act(async () => {})
    expect(latest.autosave.hasUnsaved()).toBe(true)
    act(() => window.dispatchEvent(new Event("pagehide")))
    expect(saveDraftKeepalive).not.toHaveBeenCalled()
    await act(async () => { await latest.autosave.flush() })
    expect(mockSaveDraft).not.toHaveBeenCalled()
  })

  it("continues to retry a rejected draft even when local edits do not change again", async () => {
    mockSaveDraft.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ ...serverVersion, AdminNote: "persist me" })
    render(<Harness exerciseId="ex-1" />)
    await screen.findByDisplayValue("Web 101")
    await act(async () => {})
    vi.useFakeTimers()
    act(() => latest.draftForm.setValue("AdminNote", "persist me"))
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(latest.autosave.status).toBe("error")
    await act(async () => { await latest.autosave.flush() })
    expect(mockSaveDraft).toHaveBeenCalledTimes(2)
    expect(latest.autosave.hasUnsaved()).toBe(false)
  })

  it("ignores document object key order while preserving meaningful content array order", async () => {
    const loaded = structuredClone(serverVersion)
    loaded.Variants[0].Tasks[0].Description = { root: { type: "root", children: [{ text: "first", type: "text" }, { text: "second", type: "text" }] } }
    mockGetDraft.mockResolvedValue(loaded)
    mockSaveDraft.mockResolvedValue(loaded)
    render(<Harness exerciseId="ex-1" />)
    await screen.findByDisplayValue("Web 101")
    await act(async () => {})
    vi.useFakeTimers()
    act(() => latest.draftForm.setValue("Variants.0.Tasks.0.Description", { root: { children: [{ type: "text", text: "first" }, { type: "text", text: "second" }], type: "root" } }))
    await act(async () => { await latest.autosave.flush() })
    expect(mockSaveDraft).not.toHaveBeenCalled()
    act(() => latest.draftForm.setValue("Variants.0.Tasks.0.Description", { root: { children: [{ type: "text", text: "second" }, { type: "text", text: "first" }], type: "root" } }))
    await act(async () => { await latest.autosave.flush() })
    expect(mockSaveDraft).toHaveBeenCalledTimes(1)
  })

  it("puts a rejected exercise name on Name and preserves the unsaved draft", async () => {
    mockUpdate.mockRejectedValueOnce(new ApiError(409, { Status: { Code: 40903 } }))
    render(<Harness exerciseId="ex-1" />)
    await screen.findByDisplayValue("Web 101")
    await act(async () => {})
    vi.useFakeTimers()
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Taken name" } })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(latest.identityForm.getFieldState("Name").error?.message).toBe("admin.ex.err.exists")
    expect(latest.autosave.hasUnsaved()).toBe(true)
    expect(latest.identityForm.getValues("Name")).toBe("Taken name")
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("creates the exercise once the name is valid, then saves the working copy", async () => {
    const onCreated = vi.fn()
    render(<Harness onCreated={onCreated} />)
    vi.useFakeTimers()
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "ab" } })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(mockCreate).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Buffer overflow" } })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(mockCreate).toHaveBeenCalledWith({ Name: "Buffer overflow", Description: "", Tags: [] })
    expect(onCreated).toHaveBeenCalledWith(created)
    expect(mockSaveDraft).toHaveBeenCalledWith("new-exercise", expect.objectContaining({ AdminNote: "" }))
    expect(screen.getByTestId("status")).toHaveTextContent("saved")
  })

  it("keeps unconfirmed edits in the buffer until the server acknowledges them", async () => {
    mockSaveDraft.mockRejectedValueOnce(new Error("offline"))
    render(<Harness />)
    vi.useFakeTimers()
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Buffer overflow" } })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(storage.get(pendingBufferKey("editor-1", null))).toContain("Buffer overflow")
    await act(async () => { await vi.advanceTimersByTimeAsync(700) })
    expect(screen.getByTestId("status")).toHaveTextContent("error")
    expect(storage.has(pendingBufferKey("editor-1", null))).toBe(false)
    expect(storage.get(pendingBufferKey("editor-1", "new-exercise"))).toContain("Buffer overflow")
    await act(async () => { await latest.autosave.flush() })
    expect(storage.has(pendingBufferKey("editor-1", "new-exercise"))).toBe(false)
  })

  it("adopts server-assigned IDs without another save", async () => {
    render(<Harness />)
    vi.useFakeTimers()
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Buffer overflow" } })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(latest.draftForm.getValues("Variants.0.ID")).toBe("variant-1")
    expect(latest.draftForm.getValues("Variants.0.Tasks.0.ID")).toBe("task-1")
    expect(latest.getDraftVersionId()).toBe("draft-1")
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(mockSaveDraft).toHaveBeenCalledTimes(1)
  })

  it("turns a typed secret into a stored one after the save: its group comes from the answer, nothing else changes, no second save", async () => {
    const device = { ...emptyDevice(), ID: "dev-1", Name: "web", Image: "web:1",
      EnvVars: [{ Name: "FLAG", Value: "s3cret", Secret: true, HasValue: false }, { Name: "MODE", Value: "ctf", Secret: false, HasValue: false }] }
    const stored = structuredClone(serverVersion)
    stored.Variants[0].Topology.Devices = [{ ...device, External: null, Persistence: null,
      EnvVars: [{ Name: "FLAG", Value: "", Secret: true, HasValue: true, ValueGroup: 1 }, { Name: "MODE", Value: "ctf", Secret: false, HasValue: false }] }]
    mockSaveDraft.mockResolvedValue(stored)
    render(<Harness />)
    act(() => {
      latest.draftForm.setValue("Variants.0.Topology.Devices", [device])
      latest.draftForm.setValue("Variants.0.Note", "kept note")
    })
    vi.useFakeTimers()
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Buffer overflow" } })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(mockSaveDraft.mock.calls[0][1].Variants[0].Topology.Devices?.[0].EnvVars?.[0]).toEqual({ Name: "FLAG", Value: "s3cret", Secret: true })
    expect(latest.draftForm.getValues("Variants.0.Topology.Devices.0.EnvVars")).toEqual([
      { Name: "FLAG", Value: "", Secret: true, HasValue: true, ValueGroup: 1 },
      { Name: "MODE", Value: "ctf", Secret: false, HasValue: false },
    ])
    expect(latest.draftForm.getValues("Variants.0.Note")).toBe("kept note")
    expect(latest.draftForm.getValues("Variants.0.Topology.Devices.0.Image")).toBe("web:1")
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(mockSaveDraft).toHaveBeenCalledTimes(1)
  })

  it("keeps a secret typed further while the save was in flight", async () => {
    let resolveSave: (value: Version) => void = () => undefined
    mockSaveDraft.mockImplementationOnce(() => new Promise((resolve) => { resolveSave = resolve }))
    const device = { ...emptyDevice(), ID: "dev-1", Name: "web", EnvVars: [{ Name: "FLAG", Value: "s3", Secret: true, HasValue: false }] }
    const stored = structuredClone(serverVersion)
    stored.Variants[0].Topology.Devices = [{ ...device, External: null, Persistence: null, EnvVars: [{ Name: "FLAG", Value: "", Secret: true, HasValue: true, ValueGroup: 1 }] }]
    render(<Harness />)
    act(() => latest.draftForm.setValue("Variants.0.Topology.Devices", [device]))
    vi.useFakeTimers()
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Buffer overflow" } })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    act(() => latest.draftForm.setValue("Variants.0.Topology.Devices.0.EnvVars.0.Value", "s3cret"))
    await act(async () => { resolveSave(stored) })
    expect(latest.draftForm.getValues("Variants.0.Topology.Devices.0.EnvVars.0")).toEqual({ Name: "FLAG", Value: "s3cret", Secret: true, HasValue: false })
  })

  it("adopts nothing when a task is added to the form while the save is still in flight", async () => {
    let resolveSave: (value: Version) => void = () => undefined
    mockSaveDraft.mockImplementationOnce(() => new Promise((resolve) => { resolveSave = resolve }))
    render(<Harness />)
    vi.useFakeTimers()
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Buffer overflow" } })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(mockCreate).toHaveBeenCalled()
    expect(mockSaveDraft).toHaveBeenCalledTimes(1)
    // While that saveDraft is still in flight, a task is added to the live form.
    act(() => {
      latest.draftForm.setValue("Variants.0.Tasks", [
        ...latest.draftForm.getValues("Variants.0.Tasks"),
        { ...emptyTask(), Name: "Second task" },
      ])
    })
    await act(async () => { resolveSave(serverVersion) })
    // The response was for the ID-less single-task snapshot sent before the add — the
    // form's ID sequence no longer matches it, so no IDs from that response are adopted.
    expect(latest.draftForm.getValues("Variants.0.ID")).toBe("")
    expect(latest.draftForm.getValues("Variants.0.Tasks.0.ID")).toBe("")
  })

  it("applies buffered edits to the loaded copy, keeps server flags, and sends them", async () => {
    const draft = toDraftFormValues(serverVersion)
    draft.Variants[0].Tasks[0].Name = "Edited offline"
    writePendingChanges(pendingBufferKey("editor-1", "ex-1"), { Name: "Offline name", Description: "", Tags: [] }, draft)
    const onPendingRestored = vi.fn()
    render(<Harness exerciseId="ex-1" onPendingRestored={onPendingRestored} />)
    expect(await screen.findByDisplayValue("Offline name")).toBeInTheDocument()
    expect(latest.draftForm.getValues("Variants.0.Tasks.0.Flag")).toEqual(["ICE{server}"])
    expect(toast.success).toHaveBeenCalledWith("admin.exPage.toast.pendingRestored")
    expect(onPendingRestored).toHaveBeenCalled()
    // The restore is queued by a passive effect that can run after the inputs commit;
    // flushing before it would find nothing to send.
    await waitFor(() => expect(latest.autosave.hasUnsaved()).toBe(true))
    await act(async () => { await latest.autosave.flush() })
    expect(mockUpdate).toHaveBeenCalledWith("ex-1", { Name: "Offline name", Description: "", Tags: [] })
    expect(mockSaveDraft).toHaveBeenCalledWith("ex-1", expect.objectContaining({
      Variants: [expect.objectContaining({ Tasks: [expect.objectContaining({ Name: "Edited offline", Flag: ["ICE{server}"] })] })],
    }))
  })

  it("turns the empty working copy into one editable variant and never exposes the zero ID", async () => {
    mockGetDraft.mockResolvedValue({ ...serverVersion, ID: "00000000-0000-0000-0000-000000000000", Variants: [] })
    render(<Harness exerciseId="ex-1" editable={false} />)
    await screen.findByDisplayValue("Web 101")
    expect(latest.draftForm.getValues("Variants")).toHaveLength(1)
    expect(latest.getDraftVersionId()).toBe("")
  })

  it("loads a history version read-only and leaves the buffer alone", async () => {
    writePendingChanges(pendingBufferKey("editor-1", "ex-1"), { Name: "Offline", Description: "", Tags: [] }, toDraftFormValues(serverVersion))
    mockGetVersion.mockResolvedValue({ ...serverVersion, ID: "snap-1", Status: "checkpoint" })
    render(<Harness exerciseId="ex-1" versionId="snap-1" editable={false} />)
    expect(await screen.findByDisplayValue("Web 101")).toBeInTheDocument()
    expect(mockGetVersion).toHaveBeenCalledWith("ex-1", "snap-1")
    expect(mockGetDraft).not.toHaveBeenCalled()
    expect(storage.has(pendingBufferKey("editor-1", "ex-1"))).toBe(true)
  })

  it("reports a missing exercise", async () => {
    mockGetExercise.mockRejectedValue(new Error("404"))
    render(<Harness exerciseId="missing" />)
    expect(await screen.findByText("not found")).toBeInTheDocument()
  })

  it("shows a load error for a server failure and loads again on retry", async () => {
    mockGetExercise.mockRejectedValueOnce(new ApiError(503, null)).mockResolvedValue(exercise)
    render(<Harness exerciseId="ex-1" />)
    fireEvent.click(await screen.findByText("retry"))
    await waitFor(() => expect(latest.loadState).toBe("ready"))
    expect(mockGetExercise).toHaveBeenCalledTimes(2)
  })

  it("treats a 404 answer as a missing exercise, not a load error", async () => {
    mockGetExercise.mockRejectedValue(new ApiError(404, null))
    render(<Harness exerciseId="missing" />)
    expect(await screen.findByText("not found")).toBeInTheDocument()
  })

  it("does not call onCreated after unmount, but still migrates the buffer to the exercise key", async () => {
    let resolveCreate: (value: Exercise) => void = () => undefined
    mockCreate.mockImplementationOnce(() => new Promise((resolve) => { resolveCreate = resolve }))
    // The draft save never succeeds here — this keeps the buffer observable after the
    // round settles instead of it being cleared by a fully successful save cycle, which
    // isn't what this test is about (see the "adopts server-assigned IDs" test for that).
    mockSaveDraft.mockRejectedValue(new Error("offline"))
    const onCreated = vi.fn()
    const { unmount } = render(<Harness onCreated={onCreated} />)
    vi.useFakeTimers()
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Buffer overflow" } })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(mockCreate).toHaveBeenCalledTimes(1)
    // The create request is still in flight when the page (and this hook instance)
    // unmounts — the autosave queue's unmount-flush keeps the save running.
    const inFlightAutosave = latest.autosave
    unmount()
    await act(async () => {
      resolveCreate(created)
      // The queue instance survives the unmount (nothing disposes it) — flush() chains
      // onto the still-running save and resolves once the whole chain has settled.
      await inFlightAutosave.flush()
    })
    expect(onCreated).not.toHaveBeenCalled()
    expect(storage.get(pendingBufferKey("editor-1", "new-exercise"))).toContain("Buffer overflow")
    expect(storage.has(pendingBufferKey("editor-1", null))).toBe(false)
  })

  it("shows one error toast for repeated identical save failures, not one per retry", async () => {
    mockSaveDraft.mockRejectedValue(new Error("offline"))
    render(<Harness exerciseId="ex-1" />)
    await screen.findByDisplayValue("Web 101")
    // Let any still-settling microtasks from the load drain before switching to fake
    // timers — otherwise a stray real-timer/microtask tick can race the first
    // advanceTimersByTimeAsync below and flake this assertion.
    await act(async () => {})
    vi.useFakeTimers()
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Renamed once" } })
    act(() => latest.draftForm.setValue("AdminNote", "Changed draft"))
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(screen.getByTestId("status")).toHaveTextContent("error")
    expect(toast.error).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Renamed twice" } })
    act(() => latest.draftForm.setValue("AdminNote", "Changed draft again"))
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(screen.getByTestId("status")).toHaveTextContent("error")
    // Same underlying failure both times — still only one toast.
    expect(toast.error).toHaveBeenCalledTimes(1)
  })

  it("does not report an invalidated identity edit as saved, and keeps the buffer", async () => {
    render(<Harness exerciseId="ex-1" />)
    await screen.findByDisplayValue("Web 101")
    await act(async () => {})
    vi.useFakeTimers()
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "ab" } })
    act(() => latest.draftForm.setValue("AdminNote", "Keep the changed draft"))
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(mockUpdate).not.toHaveBeenCalled()
    // The draft still goes out so it isn't lost...
    expect(mockSaveDraft).toHaveBeenCalledTimes(1)
    // ...but the round is reported as not saved (error: indicator + leave guard), the
    // buffer (holding "ab") stays, and no save-failed toast — the field shows the error.
    expect(screen.getByTestId("status")).toHaveTextContent("error")
    expect(storage.get(pendingBufferKey("editor-1", "ex-1"))).toContain("\"ab\"")
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("sends the identity once for a name with surrounding spaces, not on every save", async () => {
    render(<Harness exerciseId="ex-1" />)
    await screen.findByDisplayValue("Web 101")
    await act(async () => {})
    vi.useFakeTimers()
    fireEvent.change(screen.getByLabelText("name"), { target: { value: " Web 102 " } })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockUpdate).toHaveBeenCalledWith("ex-1", { Name: "Web 102", Description: "", Tags: [] })
    act(() => { latest.draftForm.setValue("AdminNote", "note") })
    await act(async () => { await latest.autosave.flush() })
    expect(mockSaveDraft).toHaveBeenCalledTimes(1)
    expect(mockUpdate).toHaveBeenCalledTimes(1)
  })

  it("skips the identity PATCH when only spaces were added around the saved name", async () => {
    render(<Harness exerciseId="ex-1" />)
    await screen.findByDisplayValue("Web 101")
    await act(async () => {})
    vi.useFakeTimers()
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Web 101 " } })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(mockSaveDraft).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("waits for userId before loading, then never reloads on a later userId change", async () => {
    const { rerender } = render(<Harness exerciseId="ex-1" userId={null} />)
    expect(screen.getByText("loading")).toBeInTheDocument()
    expect(mockGetExercise).not.toHaveBeenCalled()

    rerender(<Harness exerciseId="ex-1" userId="editor-1" />)
    expect(await screen.findByDisplayValue("Web 101")).toBeInTheDocument()
    expect(mockGetExercise).toHaveBeenCalledTimes(1)

    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Typed after userId arrived" } })
    // A later userId change (e.g. a session refresh) must not re-trigger the load and
    // wipe out what was just typed.
    rerender(<Harness exerciseId="ex-1" userId="editor-2" />)
    expect(screen.getByDisplayValue("Typed after userId arrived")).toBeInTheDocument()
    expect(mockGetExercise).toHaveBeenCalledTimes(1)
  })

  it("under StrictMode, creates the exercise exactly once and calls onCreated exactly once", async () => {
    const onCreated = vi.fn()
    render(
      <StrictMode>
        <Harness onCreated={onCreated} />
      </StrictMode>,
    )
    vi.useFakeTimers()
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Buffer overflow" } })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    // Before the fix, mountedRef's effect only ever returned a cleanup (no setup), so
    // StrictMode's dev mount→cleanup→mount left it stuck at `false` forever and
    // onCreated (and the create call gated behind the same mounted check further down)
    // never fired at all.
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(onCreated).toHaveBeenCalledTimes(1)
  })

  it("under StrictMode, a restored /new buffer creates the exercise exactly once, even with typing during the create", async () => {
    writePendingChanges(pendingBufferKey("editor-1", null), { Name: "Buffer overflow", Description: "", Tags: [] }, emptyDraft())
    let resolveCreate: (value: Exercise) => void = () => undefined
    mockCreate.mockImplementationOnce(() => new Promise((resolve) => { resolveCreate = resolve }))
    vi.useFakeTimers()
    render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    )
    expect(screen.getByDisplayValue("Buffer overflow")).toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(mockCreate).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Buffer overflow 2" } })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    await act(async () => { resolveCreate(created) })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockUpdate).toHaveBeenCalledWith("new-exercise", { Name: "Buffer overflow 2", Description: "", Tags: [] })
  })

  it("forgets a /new buffer instead of restoring it without write permission", async () => {
    writePendingChanges(pendingBufferKey("editor-1", null), { Name: "Buffer overflow", Description: "", Tags: [] }, emptyDraft())
    const onPendingRestored = vi.fn()
    vi.useFakeTimers()
    render(<Harness canWrite={false} editable={false} onPendingRestored={onPendingRestored} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(screen.getByLabelText("name")).toHaveValue("")
    expect(onPendingRestored).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
    expect(storage.has(pendingBufferKey("editor-1", null))).toBe(false)
  })

  it("under StrictMode, an existing exercise still reaches ready instead of getting stuck loading", async () => {
    render(
      <StrictMode>
        <Harness exerciseId="ex-1" />
      </StrictMode>,
    )
    // Before the fix: the first StrictMode pass sets loadStartedRef and starts the
    // fetch; the simulated cleanup cancels that run without resetting loadStartedRef;
    // the second pass then sees loadStartedRef already set and returns immediately —
    // no load ever completes, and the page is stuck on "loading" forever.
    expect(await screen.findByDisplayValue("Web 101")).toBeInTheDocument()
    expect(latest.loadState).toBe("ready")
    // Exactly one of the two StrictMode invocations settles ("effective load"): the
    // first is cancelled before it can apply its result, so `identityForm`/`draftForm`
    // are reset exactly once with the loaded data, not corrupted by a double-apply.
    expect(latest.identityForm.getValues("Name")).toBe("Web 101")
  })
})

describe("archive replacement ownership", () => {
 it("drains same-tick identity and delayed draft save before allowing preview, then installs authoritative baseline", async () => {
  let release!: (value: Version) => void
  mockSaveDraft.mockImplementationOnce(() => new Promise(r => { release = r }))
  render(<Harness exerciseId="ex-1" />)
  await screen.findByDisplayValue("Web 101")
  let preparing!: Promise<boolean>
  act(() => {
   latest.identityForm.setValue("Name", "Local edit")
   latest.draftForm.setValue("AdminNote", "Local note")
   preparing = latest.prepareImportReplacement()
  })
  await waitFor(() => expect(mockSaveDraft).toHaveBeenCalledTimes(1))
  expect(latest.replacementActive).toBe(true)
  window.dispatchEvent(new Event("pagehide"))
  expect(saveDraftKeepalive).not.toHaveBeenCalled()
  await act(async () => { release({ ...serverVersion, AdminNote: "Local note" }); expect(await preparing).toBe(true) })
  expect(mockUpdate).toHaveBeenCalledWith("ex-1", expect.objectContaining({ Name: "Local edit" }))
  mockGetExercise.mockResolvedValue({ ...exercise, Name: "Imported" })
  mockGetDraft.mockResolvedValue({ ...serverVersion, Name: "Imported", AdminNote: "Imported note" })
  await act(async () => { await latest.reconcileImportReplacement() })
  expect(latest.identityForm.getValues("Name")).toBe("Imported")
  expect(latest.draftForm.getValues("AdminNote")).toBe("Imported note")
  expect(latest.autosave.hasUnsaved()).toBe(false)
  expect(latest.replacementActive).toBe(false)
 })
 it("keeps values after failed prepare and safely fences a failed authoritative reload for retry", async () => {
  mockUpdate.mockRejectedValueOnce(new TypeError("offline"))
  render(<Harness exerciseId="ex-1" />)
  await screen.findByDisplayValue("Web 101")
  act(() => latest.identityForm.setValue("Name", "Keep me"))
  await act(async () => expect(await latest.prepareImportReplacement()).toBe(false))
  expect(latest.identityForm.getValues("Name")).toBe("Keep me")
  expect(latest.replacementActive).toBe(false)
  await act(async () => expect(await latest.prepareImportReplacement()).toBe(true))
  mockGetDraft.mockRejectedValueOnce(new TypeError("offline"))
  await act(async () => { await expect(latest.reconcileImportReplacement()).rejects.toThrow() })
  expect(latest.replacementActive).toBe(true)
  expect(latest.identityForm.getValues("Name")).toBe("Keep me")
  await act(async () => { await latest.reconcileImportReplacement() })
  expect(latest.replacementActive).toBe(false)
 })
})

it("a catalog update marker fences a remounted editor and refuses to restore its old pending buffer", async () => {
 const { recordImportPlan, settleImportPlan } = await import("@/lib/importReplacement")
 const plan = { UploadID: "owned", Password: "secret", Targets: [{ ItemKey: "folder", Mode: "update" as const, ExerciseID: "ex-1" }], ConfirmedUpdates: [{ ItemKey: "folder", Revision: "r", ReplaceDraft: true }] }
 writePendingChanges(pendingBufferKey("editor-1", "ex-1"), { Name: "Old buffered name", Description: "", Tags: [] }, emptyDraft())
 recordImportPlan("editor-1", plan, "queued")
 const first = render(<Harness exerciseId="ex-1" />)
 await screen.findByDisplayValue("Web 101")
 expect(latest.replacementActive).toBe(true)
 expect(latest.replacementRecovery?.jobID).toBe("queued")
 window.dispatchEvent(new Event("pagehide"))
 first.unmount()
 expect(mockUpdate).not.toHaveBeenCalled()
 expect(mockSaveDraft).not.toHaveBeenCalled()
 mockGetExercise.mockResolvedValue({ ...exercise, Name: "Imported now" })
 mockGetDraft.mockResolvedValue({ ...serverVersion, Name: "Imported now" })
 settleImportPlan("editor-1", plan, true)
 render(<Harness exerciseId="ex-1" />)
 await screen.findByDisplayValue("Imported now")
 expect(latest.replacementActive).toBe(true)
 await act(async () => { await latest.reconcileImportReplacement() })
 expect(latest.replacementActive).toBe(false)
 expect(latest.autosave.hasUnsaved()).toBe(false)
 expect(mockSaveDraft).not.toHaveBeenCalled()
})

it("catalog replacement waits for an orphaned unmount PATCH then PUT before preview can continue", async () => {
 const { prepareImportEditors } = await import("@/lib/importReplacement")
 let patch!: (value: Exercise) => void, put!: (value: Version) => void
 mockUpdate.mockImplementationOnce(() => new Promise(resolve => { patch = resolve }))
 mockSaveDraft.mockImplementationOnce(() => new Promise(resolve => { put = resolve }))
 const screenA = render(<Harness exerciseId="ex-1" userId="orphan-actor" />)
 await screen.findByDisplayValue("Web 101")
 let saving!: Promise<boolean>
 act(() => {
  latest.identityForm.setValue("Name", "Before catalog")
  latest.draftForm.setValue("AdminNote", "Before catalog")
  saving = latest.autosave.flush()
 })
 await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))
 screenA.unmount()
 let prepared = false
 const draining = prepareImportEditors("orphan-actor", ["ex-1"]).then(ok => { prepared = ok })
 expect(prepared).toBe(false)
 await act(async () => { patch({ ...exercise, Name: "Before catalog" }); await Promise.resolve() })
 await waitFor(() => expect(mockSaveDraft).toHaveBeenCalledTimes(1))
 expect(prepared).toBe(false)
 await act(async () => { put({ ...serverVersion, AdminNote: "Before catalog" }); await saving; await draining })
 expect(prepared).toBe(true)
 expect(mockSaveDraft).toHaveBeenCalledTimes(1)
})
