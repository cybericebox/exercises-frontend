import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import type { Exercise } from "@/api/exercises/catalog"
import type { Version } from "@/api/exercises/versions"

const h = vi.hoisted(() => ({ perms: new Set<string>(), push: vi.fn() }))

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
vi.mock("@/lib/useRole", () => ({ useRole: () => ({ me: { ID: "editor-1" }, isLoading: false, can: (p: string) => h.perms.has(p) }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push, replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
// Plain anchor: the test has no app router to navigate with.
vi.mock("next/link", () => ({
  default: ({ href, children, onClick, ...rest }: { href: string; children: React.ReactNode; onClick?: (e: React.MouseEvent) => void }) =>
    <a href={href} {...rest} onClick={(event) => { onClick?.(event); event.preventDefault() }}>{children}</a>,
}))
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock("@/components/exercises/TaskAccordion", () => ({ TaskAccordion: () => <p>tasks panel</p> }))
vi.mock("@/components/exercises/TopologySection", () => ({ TopologySection: () => <p>topology panel</p> }))
vi.mock("@/api/exercises/capabilities", () => ({ getExerciseCapabilities: vi.fn().mockResolvedValue({ Laboratories: true }) }))
vi.mock("@/api/exercises/catalog", () => ({
  createExercise: vi.fn(), getExercise: vi.fn(), updateExercise: vi.fn(), updateExerciseKeepalive: vi.fn(),
  listExerciseTags: vi.fn().mockResolvedValue([]), getExerciseUsage: vi.fn().mockResolvedValue({ Events: [] }),
  deleteExercise: vi.fn(), archiveExercise: vi.fn(), unarchiveExercise: vi.fn(),
}))
vi.mock("@/api/exercises/versions", () => ({
  EMPTY_VERSION_ID: "00000000-0000-0000-0000-000000000000",
  isStoredVersionId: (id: string) => id !== "" && id !== "00000000-0000-0000-0000-000000000000",
  getDraft: vi.fn(), getVersion: vi.fn(), saveDraft: vi.fn(), saveDraftKeepalive: vi.fn(), listVersions: vi.fn().mockResolvedValue([]),
  publishDraft: vi.fn(), createCheckpoint: vi.fn(), restoreVersion: vi.fn(),
}))

import { createExercise, getExercise } from "@/api/exercises/catalog"
import { publishDraft, saveDraft } from "@/api/exercises/versions"
import { toast } from "@/components/ui/toast"
import NewExercisePage from "./page"
import { OWNERSHIP } from "@/test/exerciseFixtures"

const created: Exercise = {
  ...OWNERSHIP,
  ID: "new-exercise", Name: "Buffer overflow", Description: "", Tags: [], DraftVersionID: null, PublishedVersionID: null,
  ArchivedAt: null, HasChanges: true, CreatedAt: "", CreatedBy: null, UpdatedAt: "2026-09-26T10:00:00Z", UpdatedBy: null,
}
const savedVersion: Version = {
  ID: "draft-1", ExerciseID: "new-exercise", Status: "draft", AdminNote: "", Label: "", CreatedAt: "", CreatedBy: null, PublishedAt: null,
  Variants: [{ ID: "variant-1", Index: 1, Note: "", Tasks: [{ ID: "task-1", Name: "", Description: null, Difficulty: "easy", Flag: [],
    LinkedDeviceID: "", DeviceFlagVar: "", Attachments: [], Placeholders: [], Hints: [] }],
    Topology: { VPN: { Enabled: false, DHCP: true }, Internet: { Enabled: false, DHCP: true }, Devices: [], Connections: [], VisualRender: null } }],
}
let storage: Map<string, string>

beforeEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  h.perms = new Set(["exercises.read", "exercises.write", "exercises.publish", "exercises.delete", "exercises.export"])
  storage = new Map()
  Object.defineProperty(window, "localStorage", { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, String(value)) },
    removeItem: (key: string) => { storage.delete(key) },
    clear: () => { storage.clear() },
  } })
  vi.mocked(createExercise).mockResolvedValue(created)
  vi.mocked(getExercise).mockResolvedValue(created)
  vi.mocked(saveDraft).mockResolvedValue(savedVersion)
})

describe("new exercise page", () => {
  it("starts in edit mode with creation-only actions and the frozen form", () => {
    render(<NewExercisePage />)
    expect(screen.getByRole("heading", { name: "admin.ex.create.title" })).toBeInTheDocument()
    expect(screen.queryByText(/admin\.exPage\.meta\./)).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "admin.exPage.action.history" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "admin.exPage.action.publish" })).toBeDisabled()
    expect(screen.getByRole("link", { name: "admin.ex.create.cancel" })).toHaveAttribute("href", "/")
    expect(screen.queryByRole("button", { name: "admin.exPage.action.more" })).not.toBeInTheDocument()
    expect(screen.getByLabelText(/admin.ex.field.name/)).toBeEnabled()
    expect(screen.getByRole("tab", { name: "admin.ex.create.tab.general", selected: true })).toBeInTheDocument()
  })

  it("creates the exercise from a valid name and swaps the address without reloading", async () => {
    const replaceState = vi.spyOn(window.history, "replaceState")
    render(<NewExercisePage />)
    vi.useFakeTimers()
    fireEvent.change(screen.getByLabelText(/admin.ex.field.name/), { target: { value: "Buffer overflow" } })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(createExercise).toHaveBeenCalledWith({ Name: "Buffer overflow", Description: "", Tags: [] })
    expect(replaceState).toHaveBeenCalledWith(null, "", "/detail?id=new-exercise")
    expect(saveDraft).toHaveBeenCalledWith("new-exercise", expect.objectContaining({ Variants: expect.any(Array) }))
    expect(toast.success).toHaveBeenCalledWith("admin.exPage.toast.created")
    expect(screen.getByRole("heading", { name: "Buffer overflow" })).toBeInTheDocument()
    expect(screen.getByText("admin.exPage.save.saved")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "admin.exPage.action.done" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "admin.exPage.action.history" })).toBeEnabled()
  })

  it("blocks Publish on an invalid name with the name toast, not a save failure", async () => {
    render(<NewExercisePage />)
    vi.useFakeTimers()
    const name = screen.getByLabelText(/admin.ex.field.name/)
    fireEvent.change(name, { target: { value: "Buffer overflow" } })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    fireEvent.change(name, { target: { value: "Qz" } })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "admin.exPage.action.publish" })) })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(toast.error).toHaveBeenCalledWith("admin.exPage.toast.invalidName")
    expect(toast.error).not.toHaveBeenCalledWith("admin.exPage.toast.saveFailed")
    expect(publishDraft).not.toHaveBeenCalled()
    expect(screen.getByRole("tab", { name: "admin.ex.create.tab.general", selected: true })).toBeInTheDocument()
    expect(document.activeElement).toBe(name)
  })

  it("keeps a too-short name in the browser only and forgets it on Cancel", async () => {
    render(<NewExercisePage />)
    vi.useFakeTimers()
    fireEvent.change(screen.getByLabelText(/admin.ex.field.name/), { target: { value: "Qz" } })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(createExercise).not.toHaveBeenCalled()
    expect(storage.get("cib_exercise_pending_editor-1_new")).toContain("Qz")
    fireEvent.click(screen.getByRole("link", { name: "admin.ex.create.cancel" }))
    expect(storage.has("cib_exercise_pending_editor-1_new")).toBe(false)
  })

  it("refuses without exercises.write", () => {
    h.perms = new Set(["exercises.read"])
    render(<NewExercisePage />)
    expect(screen.getByRole("alert")).toHaveTextContent("admin.ex.create.forbidden")
  })
})
