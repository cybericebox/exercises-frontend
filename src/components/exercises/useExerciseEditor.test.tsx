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
import { getDraft, getVersion, saveDraft } from "@/api/exercises/versions"
import { toast } from "@/components/ui/toast"
import { pendingBufferKey, writePendingChanges } from "@/lib/exercisePendingBuffer"
import { emptyDraft, emptyTask, toDraftFormValues } from "@/lib/exerciseSchemas"
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
  ID: "draft-1", ExerciseID: "ex-1", Status: "draft", AdminNote: "", Label: "", CreatedAt: "", CreatedBy: null, PublishedAt: null,
  Variants: [{ ID: "variant-1", Index: 1, Note: "", Tasks: [{ ID: "task-1", Name: "Find the flag", Description: null,
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
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(screen.getByTestId("status")).toHaveTextContent("error")
    expect(toast.error).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Renamed twice" } })
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
    expect(mockSaveDraft).toHaveBeenCalledTimes(2)
    expect(mockUpdate).toHaveBeenCalledTimes(1)
  })

  it("skips the identity PATCH when only spaces were added around the saved name", async () => {
    render(<Harness exerciseId="ex-1" />)
    await screen.findByDisplayValue("Web 101")
    await act(async () => {})
    vi.useFakeTimers()
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Web 101 " } })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(mockSaveDraft).toHaveBeenCalledTimes(1)
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
