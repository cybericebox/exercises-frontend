import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { ApiError } from "@/api/client"
import type { ImportJobStatus } from "@/api/exercises/archiveJobs"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, unknown>) => vars ? `${key} ${JSON.stringify(vars)}` : key }))
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock("@/api/exercises/archiveJobs", () => ({ getImportJob: vi.fn(), JOB_POLL_MS: 5, isPassing: () => false }))

import { getImportJob } from "@/api/exercises/archiveJobs"
import { resetImportJobsForTests, trackImportJob } from "@/lib/importJobs"
import { ImportIndicator } from "./ImportIndicator"

const status = (patch: Partial<ImportJobStatus>): ImportJobStatus => ({
  state: "running", stage: "tasks", imagesDone: 0, imagesTotal: 0, tasksDone: 5, tasksTotal: 12, bytesPushed: 0, bytesTotal: 0, exercises: [], ...patch,
})

describe("ImportIndicator", () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); resetImportJobsForTests() })

  it("renders nothing without imports", () => {
    const { container } = render(<ImportIndicator onOpen={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("shows the crest loader and the stage with counts, and reopens the import on click", async () => {
    vi.mocked(getImportJob).mockResolvedValue(status({}))
    const onOpen = vi.fn()
    render(<ImportIndicator onOpen={onOpen} />)
    act(() => trackImportJob("j1", 0))
    const chip = await screen.findByText(/admin\.exImport\.indicator .*tasksCount.*5.*12/)
    expect(chip.closest("button")!.querySelector("[role=status]")).not.toBeNull()
    expect(chip.closest("button")).toBeEnabled()
    fireEvent.click(chip)
    expect(onOpen).toHaveBeenCalledWith("j1")
  })

  it("shows one chip per import", async () => {
    vi.mocked(getImportJob).mockResolvedValue(status({}))
    render(<ImportIndicator onOpen={vi.fn()} />)
    act(() => { trackImportJob("j1", 0); trackImportJob("j2", 0) })
    expect(await screen.findAllByText(/admin\.exImport\.indicator/)).toHaveLength(2)
  })

  it("shows a failed import with its error and a details button", async () => {
    vi.mocked(getImportJob).mockResolvedValue(status({ state: "failed", stage: "failed", error: new ApiError(409, { Status: { Code: 72802 } }, undefined, undefined, 72802) }))
    const onOpen = vi.fn()
    render(<ImportIndicator onOpen={onOpen} />)
    act(() => trackImportJob("j1", 0))
    expect(await screen.findByText(/admin\.exImport\.failedWith/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "admin.exImport.details" }))
    expect(onOpen).toHaveBeenCalledWith("j1")
  })
})
