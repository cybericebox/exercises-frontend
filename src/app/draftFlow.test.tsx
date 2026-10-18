import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"

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
  createExercise: vi.fn(), getExercise: vi.fn(), listExercisesPage: vi.fn().mockResolvedValue({ Items: [], Total: 0, Page: 1, PageSize: 50 }), updateExercise: vi.fn(), updateExerciseKeepalive: vi.fn(),
  listExerciseTags: vi.fn().mockResolvedValue([]), getExerciseUsage: vi.fn().mockResolvedValue({ Events: [] }),
  deleteExercise: vi.fn(), archiveExercise: vi.fn(), unarchiveExercise: vi.fn(),
}))
vi.mock("@/api/exercises/archive", () => ({ EXPORT_LIMIT: 100 }))
vi.mock("@/api/events/list", () => ({ listEventOptions: vi.fn().mockResolvedValue([]) }))
vi.mock("@/components/shell/AccessContext", () => ({ useExerciseAccess: () => ({ access: null, loading: false }) }))
vi.mock("@/i18n/tRich", () => import("@/test/tRichMock"))
vi.mock("@/api/exercises/versions", () => ({
  EMPTY_VERSION_ID: "00000000-0000-0000-0000-000000000000",
  isStoredVersionId: (id: string) => id !== "" && id !== "00000000-0000-0000-0000-000000000000",
  getDraft: vi.fn(), getVersion: vi.fn(), saveDraft: vi.fn(), saveDraftKeepalive: vi.fn(), listVersions: vi.fn().mockResolvedValue([]),
  publishDraft: vi.fn(), createCheckpoint: vi.fn(), restoreVersion: vi.fn(),
}))

import { listExerciseTags } from "@/api/exercises/catalog"
import NewExercisePage from "./new/page"
import CatalogPage from "./page"

let storage: Map<string, string>

beforeEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  window.history.replaceState(null, "", "/")
  h.perms = new Set(["exercises.read", "exercises.write", "exercises.publish", "exercises.delete", "exercises.export"])
  storage = new Map()
  Object.defineProperty(window, "localStorage", { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, String(value)) },
    removeItem: (key: string) => { storage.delete(key) },
    clear: () => { storage.clear() },
  } })
  vi.mocked(listExerciseTags).mockResolvedValue([])
})

describe("unsaved draft flow", () => {
  it.each(["description", "name too short"])("shows the draft in the catalog after leaving the new task page (%s)", async (what) => {
    const first = render(<NewExercisePage />)
    vi.useFakeTimers()
    if (what === "description") fireEvent.change(screen.getByLabelText(/admin.ex.field.description/), { target: { value: "Some text" } })
    else fireEvent.change(screen.getByLabelText(/admin.ex.field.name/), { target: { value: "Qz" } })
    // Leave right away, before any debounce fired.
    first.unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    vi.useRealTimers()
    render(<CatalogPage />)
    expect(await screen.findByText("admin.ex.localDraft.badge")).toBeInTheDocument()
    expect(screen.getByText("admin.ex.localDraft.badge").closest("tbody")).toHaveAttribute("data-unsaved-draft")
  })
})
