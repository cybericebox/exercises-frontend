import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { ApiError } from "@/api/client"
import type { ImportJobStatus } from "@/api/exercises/archiveJobs"
import type { Exercise } from "@/api/exercises/catalog"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, unknown>) => vars ? `${key} ${JSON.stringify(vars)}` : key }))
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock("@/api/exercises/archiveJobs", () => ({
  getImportJob: vi.fn(),
  listRunningImports: vi.fn(),
  JOB_POLL_MS: 2000,
  isPassing: (error: unknown) => error instanceof ApiError && (error.status === 0 || error.status === 429 || error.status >= 500),
}))

import { getImportJob, listRunningImports } from "@/api/exercises/archiveJobs"
import { toast } from "@/components/ui/toast"
import { IMPORT_JOBS_KEY, dismissImportJob, onImportsDone, resetImportJobsForTests, trackImportJob, useImportJob, useImportJobs } from "./importJobs"

const mockGet = vi.mocked(getImportJob)
const mockList = vi.mocked(listRunningImports)
const POLL = 2000

const status = (patch: Partial<ImportJobStatus>): ImportJobStatus => ({
  state: "running", stage: "unpacking", imagesDone: 0, imagesTotal: 0, tasksDone: 0, tasksTotal: 0, bytesPushed: 0, bytesTotal: 0, exercises: [], ...patch,
})
const task = (id: string) => ({ ID: id, Name: id }) as Exercise
const stored = () => JSON.parse(localStorage.getItem(IMPORT_JOBS_KEY) ?? "[]") as string[]

describe("background import jobs", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    localStorage.clear()
    resetImportJobsForTests()
    mockList.mockResolvedValue([])
  })
  afterEach(() => { vi.useRealTimers() })

  it("keeps the job id in localStorage and follows its stage and counts", async () => {
    mockGet
      .mockResolvedValueOnce(status({ stage: "images", imagesDone: 3, imagesTotal: 7, tasksTotal: 12 }))
      .mockResolvedValue(status({ stage: "tasks", imagesDone: 7, imagesTotal: 7, tasksDone: 5, tasksTotal: 12 }))
    const { result } = renderHook(() => useImportJobs())
    act(() => trackImportJob("j1"))
    expect(stored()).toEqual(["j1"])
    expect(result.current).toMatchObject([{ jobID: "j1", state: "running", stage: "unpacking" }])

    await act(() => vi.advanceTimersByTimeAsync(POLL))
    expect(result.current[0]).toMatchObject({ stage: "images", imagesDone: 3, imagesTotal: 7 })
    await act(() => vi.advanceTimersByTimeAsync(POLL))
    expect(result.current[0]).toMatchObject({ stage: "tasks", tasksDone: 5, tasksTotal: 12 })
    expect(mockGet).toHaveBeenCalledWith("j1")
  })

  it("keeps polling with no component mounted (a closed dialog, another page)", async () => {
    mockGet.mockResolvedValue(status({}))
    trackImportJob("j1")
    await vi.advanceTimersByTimeAsync(POLL * 3)
    expect(mockGet).toHaveBeenCalledTimes(3)
  })

  it("keeps asking through a passing poll error", async () => {
    mockGet.mockRejectedValueOnce(new ApiError(502, null)).mockResolvedValue(status({ stage: "images" }))
    const { result } = renderHook(() => useImportJobs())
    act(() => trackImportJob("j1"))
    await act(() => vi.advanceTimersByTimeAsync(POLL * 2))
    expect(result.current[0]).toMatchObject({ state: "running", stage: "images" })
  })

  it("on completion: a toast, the done handlers, the id forgotten", async () => {
    mockGet.mockResolvedValue(status({ state: "done", stage: "done", tasksDone: 2, tasksTotal: 2, exercises: [task("a"), task("b")] }))
    const handler = vi.fn()
    onImportsDone(handler)
    const { result } = renderHook(() => useImportJobs())
    act(() => trackImportJob("j1"))
    await act(() => vi.advanceTimersByTimeAsync(POLL))
    expect(toast.success).toHaveBeenCalledWith('admin.exImport.done {"count":2}')
    expect(handler).toHaveBeenCalledWith([task("a"), task("b")])
    expect(stored()).toEqual([])
    expect(result.current).toEqual([])
    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it("keeps a done job for the dialog that shows it until that dialog dismisses it", async () => {
    mockGet.mockResolvedValue(status({ state: "done", stage: "done", exercises: [task("a")] }))
    const { result } = renderHook(() => useImportJob("j1"))
    act(() => trackImportJob("j1"))
    await act(() => vi.advanceTimersByTimeAsync(POLL))
    expect(result.current).toMatchObject({ state: "done", exercises: [task("a")] })
    act(() => dismissImportJob("j1"))
    expect(result.current).toBeUndefined()
  })

  it("on failure: a toast, and the job stays (persisted) until dismissed", async () => {
    const error = new ApiError(409, { Status: { Code: 72802 } }, undefined, undefined, 72802)
    mockGet.mockResolvedValueOnce(status({ stage: "images" })).mockResolvedValue(status({ state: "failed", stage: "failed", error }))
    const { result } = renderHook(() => useImportJobs())
    act(() => trackImportJob("j1"))
    await act(() => vi.advanceTimersByTimeAsync(POLL * 2))
    expect(toast.error).toHaveBeenCalledWith("admin.exImport.failed")
    expect(result.current[0]).toMatchObject({ state: "failed", error })
    expect(stored()).toEqual(["j1"])
    expect(mockGet).toHaveBeenCalledTimes(2)
    await act(() => vi.advanceTimersByTimeAsync(POLL * 3))
    expect(mockGet).toHaveBeenCalledTimes(2)

    act(() => dismissImportJob("j1"))
    expect(result.current).toEqual([])
    expect(stored()).toEqual([])
  })

  it("never dismisses a running job", () => {
    mockGet.mockResolvedValue(status({}))
    const { result } = renderHook(() => useImportJobs())
    act(() => trackImportJob("j1"))
    act(() => dismissImportJob("j1"))
    expect(result.current).toHaveLength(1)
  })

  describe("after a reload", () => {
    it("resumes a running import from localStorage at once", async () => {
      localStorage.setItem(IMPORT_JOBS_KEY, JSON.stringify(["j9"]))
      mockGet.mockResolvedValue(status({ stage: "tasks", tasksDone: 5, tasksTotal: 12 }))
      const { result } = renderHook(() => useImportJobs())
      expect(result.current).toMatchObject([{ jobID: "j9", state: "running" }])
      await act(() => vi.advanceTimersByTimeAsync(0))
      expect(mockGet).toHaveBeenCalledWith("j9")
      expect(result.current[0]).toMatchObject({ stage: "tasks", tasksDone: 5, tasksTotal: 12 })
    })

    it("announces an import that finished while the page was closed, once", async () => {
      localStorage.setItem(IMPORT_JOBS_KEY, JSON.stringify(["j9"]))
      mockGet.mockResolvedValue(status({ state: "done", stage: "done", exercises: [task("a")] }))
      const handler = vi.fn()
      onImportsDone(handler)
      renderHook(() => useImportJobs())
      await act(() => vi.advanceTimersByTimeAsync(0))
      expect(toast.success).toHaveBeenCalledWith('admin.exImport.done {"count":1}')
      expect(handler).toHaveBeenCalledTimes(1)
      expect(stored()).toEqual([])
    })

    it("shows an import that failed while the page was closed, without a second toast", async () => {
      localStorage.setItem(IMPORT_JOBS_KEY, JSON.stringify(["j9"]))
      mockGet.mockResolvedValue(status({ state: "failed", stage: "failed", error: new ApiError(409, null) }))
      const { result } = renderHook(() => useImportJobs())
      await act(() => vi.advanceTimersByTimeAsync(0))
      expect(result.current[0]).toMatchObject({ jobID: "j9", state: "failed" })
      expect(toast.error).not.toHaveBeenCalled()
      expect(stored()).toEqual(["j9"])
    })

    it("drops an id the server no longer knows", async () => {
      localStorage.setItem(IMPORT_JOBS_KEY, JSON.stringify(["gone"]))
      mockGet.mockRejectedValue(new ApiError(404, { Status: { Code: 30992 } }, undefined, undefined, 30992))
      const { result } = renderHook(() => useImportJobs())
      await act(() => vi.advanceTimersByTimeAsync(0))
      expect(result.current).toEqual([])
      expect(stored()).toEqual([])
      expect(toast.error).not.toHaveBeenCalled()
    })

    it("follows the imports the server lists even with nothing in storage (another device)", async () => {
      mockList.mockResolvedValue(["srv1", "srv2"])
      mockGet.mockResolvedValue(status({ stage: "images", imagesDone: 1, imagesTotal: 2 }))
      const { result } = renderHook(() => useImportJobs())
      await act(() => vi.advanceTimersByTimeAsync(0))
      expect(result.current.map((job) => job.jobID)).toEqual(["srv1", "srv2"])
      expect(stored()).toEqual(["srv1", "srv2"])
    })

    it("does not follow a job twice when storage and the server both name it", async () => {
      localStorage.setItem(IMPORT_JOBS_KEY, JSON.stringify(["j9"]))
      mockList.mockResolvedValue(["j9"])
      mockGet.mockResolvedValue(status({}))
      const { result } = renderHook(() => useImportJobs())
      await act(() => vi.advanceTimersByTimeAsync(0))
      expect(result.current).toHaveLength(1)
      expect(mockGet).toHaveBeenCalledTimes(1)
    })

    it("works when the server list fails (no permission, outage)", async () => {
      localStorage.setItem(IMPORT_JOBS_KEY, JSON.stringify(["j9"]))
      mockList.mockRejectedValue(new ApiError(403, null))
      mockGet.mockResolvedValue(status({}))
      const { result } = renderHook(() => useImportJobs())
      await act(() => vi.advanceTimersByTimeAsync(0))
      expect(result.current).toHaveLength(1)
    })

    it("ignores a damaged stored value", async () => {
      localStorage.setItem(IMPORT_JOBS_KEY, "{not json")
      const { result } = renderHook(() => useImportJobs())
      expect(result.current).toEqual([])
    })
  })
})
