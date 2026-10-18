import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { ApiError } from "@/api/client"
import type { ImportJobStatus } from "@/api/exercises/archiveJobs"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, unknown>) => vars ? `${key} ${JSON.stringify(vars)}` : key }))
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock("@/api/exercises/archiveJobs", () => ({ getImportJob: vi.fn(), listRunningImports: vi.fn().mockResolvedValue([]), JOB_POLL_MS: 5, isPassing: () => false }))

import { getImportJob } from "@/api/exercises/archiveJobs"
import { resetImportJobsForTests, trackImportJob } from "@/lib/importJobs"
import { ImportRows } from "./ImportRows"

const status = (patch: Partial<ImportJobStatus>): ImportJobStatus => ({
  state: "running", stage: "tasks", imagesDone: 0, imagesTotal: 0, tasksDone: 5, tasksTotal: 12, bytesPushed: 0, bytesTotal: 0, exercises: [], ...patch,
})
const table = (ui: React.ReactNode) => render(<table>{ui}</table>)

describe("ImportRows", () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); resetImportJobsForTests() })

  it("renders nothing without imports", () => {
    const { container } = table(<ImportRows columns={6} onDetails={vi.fn()} />)
    expect(container.querySelector("tbody")).toBeNull()
  })

  it("shows the crest loader, the title, the stage with counts and a determinate bar, in a neutral tone", async () => {
    vi.mocked(getImportJob).mockResolvedValue(status({}))
    table(<ImportRows columns={6} onDetails={vi.fn()} />)
    act(() => trackImportJob("j1", 0))
    const row = (await screen.findByText('admin.exImport.stage.tasksCount {"done":5,"total":12}')).closest("tbody")!
    expect(row).toHaveTextContent("admin.exImport.rowTitle")
    expect(within(row).getByRole("status")).toBeInTheDocument()
    expect(within(row).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "42")
    expect(row.querySelector("td")!.className).toContain("bg-secondary")
    expect(row.querySelector("td")!.className).not.toContain("warn")
  })

  it("has no bar while the total is not known, and shows the image bytes while images go up", async () => {
    vi.mocked(getImportJob).mockResolvedValue(status({ stage: "images", imagesDone: 0, imagesTotal: 0, bytesPushed: 1024 ** 3, bytesTotal: 2 * 1024 ** 3 }))
    table(<ImportRows columns={6} onDetails={vi.fn()} />)
    act(() => trackImportJob("j1", 0))
    const row = (await screen.findByText("admin.exImport.stage.images")).closest("tbody")!
    expect(within(row).queryByRole("progressbar")).toBeNull()
    expect(row).toHaveTextContent("admin.exImport.bytes")
  })

  it("shows one row per import", async () => {
    vi.mocked(getImportJob).mockResolvedValue(status({}))
    table(<ImportRows columns={6} onDetails={vi.fn()} />)
    act(() => { trackImportJob("j1", 0); trackImportJob("j2", 0) })
    await screen.findAllByText(/stage\.tasksCount/)
    expect(document.querySelectorAll("tbody[data-import-job=running]")).toHaveLength(2)
  })

  it("a failed import keeps its row with the error and «Подробиці»", async () => {
    vi.mocked(getImportJob).mockResolvedValue(status({ state: "failed", stage: "failed", error: new ApiError(409, { Status: { Code: 72802 } }, undefined, undefined, 72802) }))
    const onDetails = vi.fn()
    table(<ImportRows columns={6} onDetails={onDetails} />)
    act(() => trackImportJob("j1", 0))
    const button = await screen.findByRole("button", { name: "admin.exImport.details" })
    expect(button.closest("tbody")).toHaveAttribute("data-import-job", "failed")
    expect(button.closest("tbody")).toHaveTextContent("admin.exImport.failedWith")
    expect(button.closest("tbody")!.querySelector("[role=status]")).toBeNull()
    fireEvent.click(button)
    expect(onDetails).toHaveBeenCalledWith("j1")
  })

  it("the row goes away when the import is done", async () => {
    vi.mocked(getImportJob).mockResolvedValueOnce(status({})).mockResolvedValue(status({ state: "done", stage: "done", exercises: [] }))
    table(<ImportRows columns={6} onDetails={vi.fn()} />)
    act(() => trackImportJob("j1", 0))
    await screen.findByText(/stage\.tasksCount/)
    await vi.waitFor(() => expect(document.querySelector("tbody[data-import-job]")).toBeNull())
  })
})
