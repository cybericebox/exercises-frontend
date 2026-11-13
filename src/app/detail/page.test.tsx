import { beforeEach, describe, expect, it, vi } from "vitest"
import { RESOURCES_CONFIG } from '@/test/resourcesConfig'
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { Exercise } from "@/api/exercises/catalog"
import type { Version, VersionListItem } from "@/api/exercises/versions"

const h = vi.hoisted(() => ({ perms: new Set<string>(), search: "id=ex-1", push: vi.fn() }))

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
vi.mock("@/lib/useRole", () => ({ useRole: () => ({ me: { ID: "editor-1" }, isLoading: false, can: (p: string) => h.perms.has(p) }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push, replace: vi.fn() }), useSearchParams: () => new URLSearchParams(h.search) }))
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock("@/components/exercises/TaskAccordion", () => ({ TaskAccordion: () => <p>tasks panel</p> }))
vi.mock("@/api/exercises/deploy", () => ({ listDeploys: vi.fn().mockResolvedValue([]), getTestRunLengths: vi.fn().mockResolvedValue({ AllowedMinutes: [60], DefaultMinutes: 60 }) }))
import { listDeploys } from "@/api/exercises/deploy"
import { getExerciseCapabilities } from "@/api/exercises/capabilities"
vi.mock("@/api/exercises/capabilities", () => ({ getExerciseCapabilities: vi.fn().mockResolvedValue({ Laboratories: true, MaxLabGateways: 10, Resources: RESOURCES_CONFIG }) }))
vi.mock("@/api/exercises/catalog", () => ({
  getExercise: vi.fn(), updateExercise: vi.fn(), createExercise: vi.fn(), updateExerciseKeepalive: vi.fn(),
  deleteExercise: vi.fn(), archiveExercise: vi.fn(), unarchiveExercise: vi.fn(), getExerciseUsage: vi.fn(),
  listExerciseTags: vi.fn().mockResolvedValue([]),
}))
vi.mock("@/api/exercises/versions", () => ({
  EMPTY_VERSION_ID: "00000000-0000-0000-0000-000000000000",
  isStoredVersionId: (id: string) => id !== "" && id !== "00000000-0000-0000-0000-000000000000",
  getDraft: vi.fn(), getVersion: vi.fn(), saveDraft: vi.fn(), saveDraftKeepalive: vi.fn(), listVersions: vi.fn(),
  publishDraft: vi.fn(), createCheckpoint: vi.fn(), restoreVersion: vi.fn(),
}))

import { ApiError } from "@/api/client"
import { archiveExercise, deleteExercise, getExercise, getExerciseUsage, unarchiveExercise, updateExercise } from "@/api/exercises/catalog"
import { createCheckpoint, getDraft, getVersion, listVersions, publishDraft, restoreVersion, saveDraft } from "@/api/exercises/versions"
import { toast } from "@/components/ui/toast"
import { pendingBufferKey, writePendingChanges } from "@/lib/exercisePendingBuffer"
import { toDraftFormValues } from "@/lib/exerciseSchemas"
import Page from "./page"
import { normalizedDevice } from "@/test/editorFixtures"
import { OWNERSHIP } from "@/test/exerciseFixtures"

const ALL = ["exercises.read", "exercises.write", "exercises.publish", "exercises.delete", "exercises.export"]
const exercise: Exercise = {
  ...OWNERSHIP,
  ID: "ex-1", Name: "Web 101", Description: "", Tags: [], DraftVersionID: "draft-1", PublishedVersionID: "pub-1",
  ArchivedAt: null, HasChanges: true, CreatedAt: "2026-09-01T10:00:00Z", CreatedBy: null, UpdatedAt: "2026-09-20T10:00:00Z", UpdatedBy: null,
}
const task = { ID: "task-1", Name: "Find the flag", Description: { root: { type: "root", children: [{ type: "paragraph", children: [{ type: "text", text: "Find the flag in the lab." }] }] } }, Difficulty: "easy" as const, Key: "", Requires: [], Check: { Answer: { Type: "flag" as const, Values: [] } }, Attachments: [], Placeholders: [], Hints: [] }
const device = normalizedDevice({ ID: "dev-1", Name: "web", Image: "nginx" })

const workingCopy: Version = {
  ID: "draft-1", ExerciseID: "ex-1", Status: "draft", AdminNote: "", Label: "", CreatedAt: "2026-09-20T10:00:00Z", CreatedBy: null, PublishedAt: null, Resources: null, Elevation: null,
  Variants: [{ ID: "variant-1", Index: 1, Note: "", Weight: 1, LinkedTo: "", Tasks: [task],
    Topology: { Variables: [], Devices: [], Connections: [], VisualRender: null } }],
}
const withDevice: Version = {
  ...workingCopy,
  Variants: [{ ...workingCopy.Variants[0], Topology: { ...workingCopy.Variants[0].Topology, Devices: [device] } }],
}
const listItem = (patch: Partial<VersionListItem>): VersionListItem => ({
  ID: "x", Status: "checkpoint", AdminNote: "", Label: "", VariantCount: 1, CreatedAt: "2026-09-18T10:00:00Z", CreatedBy: null, PublishedAt: null, ...patch,
})

function openMore() {
  fireEvent.keyDown(screen.getByRole("button", { name: "admin.exPage.action.more" }), { key: "ArrowDown" })
}

beforeEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  h.perms = new Set(ALL)
  h.search = "id=ex-1"
  const storage = new Map<string, string>()
  Object.defineProperty(window, "localStorage", { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, String(value)) },
    removeItem: (key: string) => { storage.delete(key) },
    clear: () => { storage.clear() },
  } })
  vi.mocked(getExercise).mockResolvedValue(exercise)
  vi.mocked(getDraft).mockResolvedValue(workingCopy)
  vi.mocked(saveDraft).mockResolvedValue(workingCopy)
  vi.mocked(updateExercise).mockImplementation(async (_id, input) => ({ ...exercise, ...input }))
  vi.mocked(getExerciseUsage).mockResolvedValue({ Events: [] })
  vi.mocked(listVersions).mockResolvedValue([])
})

describe("exercise page — modes", () => {
  it("opens an existing exercise read-only with the viewing actions", async () => {
    render(<Page />)
    expect(await screen.findByRole("heading", { name: "Web 101" })).toBeInTheDocument()
    expect(screen.getByText("admin.exPage.badge.changes")).toHaveAttribute("data-badge", "changes")
    expect(screen.queryByText("admin.exPage.badge.published")).not.toBeInTheDocument()
    expect(screen.queryByRole("textbox", { name:/ed.a.general.name.label/ })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "admin.exPage.action.edit" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "admin.exPage.action.publish" })).toBeEnabled()
    expect(screen.queryByText("admin.exPage.save.saved")).not.toBeInTheDocument()
  })

  it("edits with autosave and returns to viewing on Done", async () => {
    render(<Page />)
    fireEvent.click(await screen.findByRole("button", { name: "admin.exPage.action.edit" }))
    const name = screen.getByLabelText(/ed.a.general.name.label/)
    expect(name).toBeEnabled()
    fireEvent.change(name, { target: { value: "Web 102" } })
    await waitFor(() => expect(updateExercise).toHaveBeenCalledWith("ex-1", { Name: "Web 102", Description: "", Tags: [] }), { timeout: 2000 })
    expect(await screen.findByText("admin.exPage.save.saved")).toBeInTheDocument()
    expect(saveDraft).not.toHaveBeenCalled() // A name-only edit does not rewrite the unchanged working copy.
    fireEvent.click(screen.getByRole("button", { name: "admin.exPage.action.done" }))
    expect(await screen.findByRole("button", { name: "admin.exPage.action.edit" })).toBeInTheDocument()
    expect(screen.queryByRole("textbox", { name:/ed.a.general.name.label/ })).not.toBeInTheDocument()
  })

  it("hides every action the user has no permission for", async () => {
    h.perms = new Set(["exercises.read"])
    render(<Page />)
    await screen.findByRole("heading", { name: "Web 101" })
    for (const name of ["admin.exPage.action.edit", "admin.exPage.action.publish", "admin.exPage.action.test"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument()
    }
    openMore()
    expect(await screen.findByRole("menuitem", { name:"admin.exPage.action.history" })).toBeInTheDocument()
    // The guide, the versions group and the document of the current state.
    expect(screen.getAllByRole("group")).toHaveLength(3)
  })

  it("shows the internal notes to an editor and leaves them out for a reader without full access", async () => {
    const { unmount } = render(<Page />)
    await screen.findByRole("heading", { name: "Web 101" })
    expect(screen.getByText("ed.a.general.note.label")).toBeInTheDocument()
    unmount()
    h.perms = new Set(["exercises.read"])
    render(<Page />)
    await screen.findByRole("heading", { name: "Web 101" })
    expect(screen.queryByText("ed.a.general.note.label")).not.toBeInTheDocument()
  })

  it("omits Publish when the working copy matches the publication", async () => {
    vi.mocked(getExercise).mockResolvedValue({ ...exercise, HasChanges: false })
    render(<Page />)
    expect(await screen.findByText("admin.exPage.badge.published")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "admin.exPage.action.publish" })).not.toBeInTheDocument()
  })

  it("restores unsent edits from the browser buffer, switches to editing and saves them", async () => {
    writePendingChanges(pendingBufferKey("editor-1", "ex-1"), { Name: "Offline name", Description: "", Tags: [] }, toDraftFormValues(workingCopy))
    render(<Page />)
    expect(await screen.findByDisplayValue("Offline name")).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith("admin.exPage.toast.pendingRestored")
    expect(screen.getByRole("button", { name: "admin.exPage.action.done" })).toBeInTheDocument()
    await waitFor(() => expect(updateExercise).toHaveBeenCalledWith("ex-1", { Name: "Offline name", Description: "", Tags: [] }), { timeout: 2000 })
  })

  it("treats an empty version param as the working copy, not a version view", async () => {
    h.search = "id=ex-1&version="
    render(<Page />)
    expect(await screen.findByRole("heading", { name: "Web 101" })).toBeInTheDocument()
    expect(screen.queryByText("admin.exPage.version.banner")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "admin.exPage.action.edit" })).toBeInTheDocument()
    expect(getVersion).not.toHaveBeenCalledWith("ex-1", "")
    expect(getDraft).toHaveBeenCalledWith("ex-1")
  })
})

/** The start button of the test dialog, once the run lengths were read. */
async function startButton() {
  const button = await screen.findByRole("button", { name: "ed.d.start.go" })
  await waitFor(() => expect(button).toBeEnabled())
  return button
}

describe("exercise page — publishing and history", () => {
  it("publishes a valid working copy", async () => {
    vi.mocked(publishDraft).mockResolvedValue({ ...workingCopy, Status: "published" })
    render(<Page />)
    fireEvent.click(await screen.findByRole("button", { name: "admin.exPage.action.publish" }))
    await waitFor(() => expect(publishDraft).toHaveBeenCalledWith("ex-1"))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("admin.exPage.toast.published"))
  })

  it("shows a mapped error and leaves Publish usable when publish fails", async () => {
    vi.mocked(publishDraft).mockRejectedValue(new ApiError(409, { Status: { Code: 70904 } }))
    render(<Page />)
    fireEvent.click(await screen.findByRole("button", { name: "admin.exPage.action.publish" }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("admin.ex.err.modified"))
    expect(await screen.findByRole("button", { name: "admin.exPage.action.publish" })).toBeEnabled()
  })

  it("puts a publish error that names its field into the problems list and beside the field, not into a toast", async () => {
    vi.mocked(getDraft).mockResolvedValue({ ...workingCopy, Variants: [{ ...workingCopy.Variants[0], Tasks: [{ ...task, Key: "scan" }] }] })
    vi.mocked(publishDraft).mockRejectedValue(new ApiError(400, { Status: { Code: 23519, Message: "m", Context: { task: "scan", field: "description" } } }, "m", undefined, 23519))
    render(<Page />)
    fireEvent.click(await screen.findByRole("button", { name: "admin.exPage.action.publish" }))
    const dialog = await screen.findByRole("dialog", { name: "ed.shell.issues.titlePublish" })
    expect(toast.error).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole("button", { name: "ed.shell.issues.go" }))
    expect(await screen.findByRole("tab", { name: "ed.shell.tab.tasks", selected: true })).toBeInTheDocument()
  })

  it("keeps a publish error without a place as a toast", async () => {
    vi.mocked(publishDraft).mockRejectedValue(new ApiError(400, { Status: { Code: 73509, Message: "m", Context: { features: "guest_agent" } } }, "m", undefined, 73509))
    render(<Page />)
    fireEvent.click(await screen.findByRole("button", { name: "admin.exPage.action.publish" }))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(screen.queryByRole("dialog", { name: "ed.shell.issues.titlePublish" })).not.toBeInTheDocument()
  })

  it("opens the task with a missing description before sending a publish request", async () => {
    vi.mocked(getDraft).mockResolvedValue({ ...workingCopy, Variants: [{ ...workingCopy.Variants[0], Tasks: [{ ...task, Description: null }] }] })
    render(<Page />)
    fireEvent.click(await screen.findByRole("button", { name: "admin.exPage.action.publish" }))
    expect(await screen.findByRole("dialog", { name: "ed.shell.issues.titlePublish" })).toBeInTheDocument()
    expect(publishDraft).not.toHaveBeenCalled()
  })

  it("goes to the invalid task instead of publishing", async () => {
    vi.mocked(getDraft).mockResolvedValue({ ...workingCopy, Variants: [{ ...workingCopy.Variants[0], Tasks: [{ ...task, Name: "" }] }] })
    render(<Page />)
    fireEvent.click(await screen.findByRole("button", { name: "admin.exPage.action.publish" }))
    const dialog = await screen.findByRole("dialog", { name: "ed.shell.issues.titlePublish" })
    expect(publishDraft).not.toHaveBeenCalled()
    // «Перейти» opens the subtask and closes the list.
    fireEvent.click(within(dialog).getByRole("button", { name: "ed.shell.issues.go" }))
    expect(await screen.findByRole("tab", { name: "ed.shell.tab.tasks", selected: true })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "admin.exPage.action.done" })).toBeInTheDocument()
  })

  it("opens a history entry as a read-only version view", async () => {
    vi.mocked(listVersions).mockResolvedValue([
      listItem({ ID: "draft-1", Status: "draft", CreatedAt: "2026-09-20T10:00:00Z" }),
      listItem({ ID: "snap-1", Status: "checkpoint", Label: "Before topology rework" }),
    ])
    render(<Page />)
    await screen.findByRole("heading", { name:"Web 101" })
    openMore()
    fireEvent.click(await screen.findByRole("menuitem", { name:"admin.exPage.action.history" }))
    expect(await screen.findByText("«Before topology rework»")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "admin.exHistory.view" }))
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/detail?id=ex-1&version=snap-1"))
  })

  it("shows a history version read-only and restores it", async () => {
    h.search = "id=ex-1&version=snap-1"
    vi.mocked(getVersion).mockResolvedValue({ ...workingCopy, ID: "snap-1", Status: "checkpoint", CreatedAt: "2026-09-18T10:00:00Z" })
    vi.mocked(restoreVersion).mockResolvedValue(workingCopy)
    render(<Page />)
    expect(await screen.findByText("admin.exPage.version.banner")).toBeInTheDocument()
    expect(getDraft).not.toHaveBeenCalled()
    expect(screen.queryByRole("textbox", { name:/ed.a.general.name.label/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "admin.exPage.action.edit" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "admin.exPage.action.publish" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "admin.exPage.version.restore" }))
    // It replaces the working copy: asked first, with the danger action.
    expect(restoreVersion).not.toHaveBeenCalled()
    expect(await screen.findByRole("dialog", { name: "admin.exPage.restore.title" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "admin.exPage.restore.confirm" }))
    await waitFor(() => expect(restoreVersion).toHaveBeenCalledWith("ex-1", "snap-1"))
    expect(h.push).toHaveBeenCalledWith("/detail?id=ex-1")
  })

  it("takes a snapshot with a caption", async () => {
    vi.mocked(createCheckpoint).mockResolvedValue({ ...workingCopy, Status: "checkpoint" })
    render(<Page />)
    await screen.findByRole("heading", { name: "Web 101" })
    openMore()
    fireEvent.click(await screen.findByRole("menuitem", { name: "admin.exPage.action.snapshot" }))
    fireEvent.change(screen.getByLabelText("admin.exPage.snapshot.note"), { target: { value: "Before rework" } })
    fireEvent.click(screen.getByRole("button", { name: "admin.exPage.snapshot.confirm" }))
    await waitFor(() => expect(createCheckpoint).toHaveBeenCalledWith("ex-1", "Before rework"))
  })

  it("sends one snapshot for a double click on confirm", async () => {
    vi.mocked(createCheckpoint).mockReturnValue(new Promise(() => undefined))
    render(<Page />)
    await screen.findByRole("heading", { name: "Web 101" })
    openMore()
    fireEvent.click(await screen.findByRole("menuitem", { name: "admin.exPage.action.snapshot" }))
    const confirm = screen.getByRole("button", { name: "admin.exPage.snapshot.confirm" })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    await waitFor(() => expect(createCheckpoint).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(createCheckpoint).toHaveBeenCalledTimes(1)
  })

  it("locks the form while a publish is in flight", async () => {
    let resolvePublish: (value: Version) => void = () => undefined
    vi.mocked(publishDraft).mockReturnValue(new Promise((resolve) => { resolvePublish = resolve }))
    render(<Page />)
    fireEvent.click(await screen.findByRole("button", { name: "admin.exPage.action.edit" }))
    expect(screen.getByLabelText(/ed.a.general.name.label/)).toBeEnabled()
    fireEvent.click(screen.getByRole("button", { name: "admin.exPage.action.publish" }))
    await waitFor(() => expect(publishDraft).toHaveBeenCalledWith("ex-1"))
    expect(screen.getByLabelText(/ed.a.general.name.label/)).toBeDisabled()
    resolvePublish({ ...workingCopy, Status: "published" })
    await waitFor(() => expect(screen.getByLabelText(/ed.a.general.name.label/)).toBeEnabled())
  })

  it("discards changes by restoring the published version after confirmation", async () => {
    vi.mocked(restoreVersion).mockResolvedValue(workingCopy)
    render(<Page />)
    await screen.findByRole("heading", { name: "Web 101" })
    openMore()
    fireEvent.click(await screen.findByRole("menuitem", { name: "admin.exPage.action.revert" }))
    fireEvent.click(screen.getByRole("button", { name: "admin.exPage.revert.confirm" }))
    await waitFor(() => expect(restoreVersion).toHaveBeenCalledWith("ex-1", "pub-1"))
  })

  it("keeps the test action enabled for a static variant without laboratories", async () => {
    vi.mocked(getExerciseCapabilities).mockResolvedValueOnce({ Laboratories: false, MaxLabGateways: 10, Resources: RESOURCES_CONFIG })
    render(<Page />)
    await waitFor(() => expect(getExerciseCapabilities).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))
    const test = await screen.findByRole("button", { name: "admin.exPage.action.test" })
    expect(test).toBeEnabled()
    fireEvent.click(test)
    expect(await screen.findByRole("button", { name: "ed.d.start.go" })).toBeEnabled()
  })

  it("disables a lab variant when the platform infrastructure is not connected", async () => {
    vi.mocked(getDraft).mockResolvedValue(withDevice)
    vi.mocked(getExerciseCapabilities).mockResolvedValueOnce({ Laboratories: false, MaxLabGateways: 10, Resources: RESOURCES_CONFIG })
    render(<Page />)
    await screen.findByRole("heading", { name: "Web 101" })
    await waitFor(() => expect(getExerciseCapabilities).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))
    const test = screen.getByRole("button", { name: "admin.exPage.action.test" })
    expect(test).toBeEnabled()
    fireEvent.click(test)
    expect(await screen.findByRole("button", { name: "ed.d.start.go" })).toBeDisabled()
  })

  it("tests the authoritative draft produced by a metadata-only PATCH after flush", async () => {
    vi.mocked(getDraft).mockResolvedValue(withDevice)
    vi.mocked(updateExercise).mockResolvedValue({ ...exercise, DraftVersionID:"metadata-draft-2" })
    render(<Page />)
    fireEvent.click(await screen.findByRole("button", { name:"admin.exPage.action.edit" }))
    fireEvent.change(screen.getByLabelText(/ed.a.general.name.label/), { target:{ value:"Web 103" } })
    fireEvent.click(screen.getByRole("button", { name:"admin.exPage.action.test" }))
    fireEvent.click(await startButton())
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/test?exercise=ex-1&version=metadata-draft-2&variant=variant-1&minutes=60"))
    expect(updateExercise).toHaveBeenCalledWith("ex-1", { Name:"Web 103", Description:"", Tags:[] })
    expect(saveDraft).not.toHaveBeenCalled()
  })

  it("opens the testing page for the chosen variant from the header", async () => {
    vi.mocked(getDraft).mockResolvedValue(withDevice)
    render(<Page />)
    fireEvent.click(await screen.findByRole("button", { name: "admin.exPage.action.test" }))
    fireEvent.click(await startButton())
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/test?exercise=ex-1&version=draft-1&variant=variant-1&minutes=60"))
  })
})

describe("exercise page — one test lab per user", () => {
  async function pickVariant() {
    vi.mocked(getDraft).mockResolvedValue(withDevice)
    render(<Page />)
    fireEvent.click(await screen.findByRole("button", { name: "admin.exPage.action.test" }))
    fireEvent.click(await startButton())
  }

  it("offers the user's running test of another exercise instead of starting a second", async () => {
    vi.mocked(listDeploys).mockResolvedValue([{ DeployID: "run-9", Lab: "lab", ExerciseID: "ex-2", VersionID: "v", VariantID: "x", CreatedAt: "", ExpiresAt: "2999-01-01T00:00:00Z", Tasks: [] }])
    await pickVariant()
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("admin.exTest.runningTitle")).toBeInTheDocument()
    expect(h.push).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole("button", { name: /admin\.exTest\.openLabNamed/ }))
    expect(h.push).toHaveBeenCalledWith("/test?exercise=ex-2&deploy=run-9")
  })

  it("starts a new test while fewer labs run than the limit allows", async () => {
    vi.mocked(getExerciseCapabilities).mockResolvedValue({ Laboratories: true, MaxLabGateways: 10, MaxActiveTestDeploys: 2, Resources: RESOURCES_CONFIG })
    vi.mocked(listDeploys).mockResolvedValue([{ DeployID: "run-9", Lab: "lab", ExerciseID: "ex-2", VersionID: "v", VariantID: "x", CreatedAt: "", ExpiresAt: "2999-01-01T00:00:00Z", Tasks: [] }])
    await pickVariant()
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/test?exercise=ex-1&version=draft-1&variant=variant-1&minutes=60"))
    vi.mocked(getExerciseCapabilities).mockResolvedValue({ Laboratories: true, MaxLabGateways: 10, Resources: RESOURCES_CONFIG })
  })

  it("lists every running lab once the limit is reached, each with an open button", async () => {
    vi.mocked(getExerciseCapabilities).mockResolvedValue({ Laboratories: true, MaxLabGateways: 10, MaxActiveTestDeploys: 2, Resources: RESOURCES_CONFIG })
    const lab = (id: string, ex: string) => ({ DeployID: id, Lab: "lab", ExerciseID: ex, VersionID: "v", VariantID: "x", CreatedAt: "", ExpiresAt: "2999-01-01T00:00:00Z", Tasks: [] })
    vi.mocked(listDeploys).mockResolvedValue([lab("run-8", "ex-8"), lab("run-9", "ex-9")])
    await pickVariant()
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("admin.exTest.limitDescription")).toBeInTheDocument()
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(2)
    expect(h.push).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getAllByRole("button", { name: /admin\.exTest\.openLabNamed/ })[1])
    expect(h.push).toHaveBeenCalledWith("/test?exercise=ex-9&deploy=run-9")
    vi.mocked(getExerciseCapabilities).mockResolvedValue({ Laboratories: true, MaxLabGateways: 10, Resources: RESOURCES_CONFIG })
  })

  it("opens the running test straight away when it belongs to this exercise", async () => {
    vi.mocked(listDeploys).mockResolvedValue([{ DeployID: "run-1", Lab: "lab", ExerciseID: "ex-1", VersionID: "draft-1", VariantID: "variant-1", CreatedAt: "", ExpiresAt: "2999-01-01T00:00:00Z", Tasks: [] }])
    await pickVariant()
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/test?exercise=ex-1&deploy=run-1"))
  })
})

describe("exercise page — archive and delete", () => {
  it("disables Delete while events use the exercise", async () => {
    vi.mocked(getExerciseUsage).mockResolvedValue({ Events: [{ ID: "ev-1", Name: "cybershield-2026", Archived: false }] })
    render(<Page />)
    await screen.findByRole("heading", { name: "Web 101" })
    openMore()
    expect(await screen.findByText("admin.exPage.action.deleteInUse")).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: "admin.exPage.action.delete" })).toHaveAttribute("aria-disabled", "true")
  })

  it("archives after confirmation and falls back to viewing", async () => {
    vi.mocked(archiveExercise).mockResolvedValue({ ...exercise, ArchivedAt: "2026-09-26T10:00:00Z" })
    render(<Page />)
    await screen.findByRole("heading", { name: "Web 101" })
    openMore()
    fireEvent.click(await screen.findByRole("menuitem", { name: "admin.exPage.action.archive" }))
    fireEvent.click(screen.getByRole("button", { name: "admin.exPage.archive.confirm" }))
    await waitFor(() => expect(archiveExercise).toHaveBeenCalledWith("ex-1"))
    expect(await screen.findByText("admin.exPage.archived.banner")).toBeInTheDocument()
  })

  it("keeps an archived exercise read-only and unarchives it from the banner", async () => {
    vi.mocked(getExercise).mockResolvedValue({ ...exercise, ArchivedAt: "2026-09-21T10:00:00Z" })
    vi.mocked(unarchiveExercise).mockResolvedValue(exercise)
    render(<Page />)
    expect(await screen.findByText("admin.exPage.archived.banner")).toBeInTheDocument()
    expect(screen.getByText("admin.exPage.badge.archived")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "admin.exPage.action.edit" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "admin.exPage.action.publish" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "admin.exPage.action.unarchive" }))
    await waitFor(() => expect(unarchiveExercise).toHaveBeenCalledWith("ex-1"))
    expect(await screen.findByRole("button", { name: "admin.exPage.action.edit" })).toBeInTheDocument()
  })

  it("deletes after confirmation and navigates to the list", async () => {
    vi.mocked(deleteExercise).mockResolvedValue(undefined)
    render(<Page />)
    await screen.findByRole("heading", { name: "Web 101" })
    openMore()
    fireEvent.click(await screen.findByRole("menuitem", { name: "admin.exPage.action.delete" }))
    fireEvent.click(screen.getByRole("button", { name: "admin.exPage.delete.confirm" }))
    await waitFor(() => expect(deleteExercise).toHaveBeenCalledWith("ex-1"))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("admin.exPage.toast.deleted"))
    expect(h.push).toHaveBeenCalledWith("/")
  })

  it("shows an error and does not navigate when delete fails", async () => {
    vi.mocked(deleteExercise).mockRejectedValue(new ApiError(500, null))
    render(<Page />)
    await screen.findByRole("heading", { name: "Web 101" })
    openMore()
    fireEvent.click(await screen.findByRole("menuitem", { name: "admin.exPage.action.delete" }))
    fireEvent.click(screen.getByRole("button", { name: "admin.exPage.delete.confirm" }))
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent("admin.ex.err.generic")
    expect(toast.error).not.toHaveBeenCalled()
    expect(h.push).not.toHaveBeenCalled()
  })

  it("shows not found without an id", async () => {
    h.search = ""
    render(<Page />)
    expect(await screen.findByText("admin.exDetail.notFound")).toBeInTheDocument()
  })

  it("shows not found when the exercise fails to load", async () => {
    vi.mocked(getExercise).mockRejectedValue(new ApiError(404, null))
    render(<Page />)
    expect(await screen.findByText("admin.exDetail.notFound")).toBeInTheDocument()
  })
})

