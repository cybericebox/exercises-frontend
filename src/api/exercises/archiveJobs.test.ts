import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/api/client", async (original) => ({ ...(await original<typeof import("@/api/client")>()), apiGet: vi.fn() }))

import * as client from "@/api/client"
import { ApiError } from "@/api/client"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"
import { JOB_MAX_WAIT_MS, JOB_POLL_MS, getImportJob, waitForExportJob } from "./archiveJobs"

const mockGet = vi.mocked(client.apiGet)
const exercise = { ID: "e1", Name: "One", Description: "", Tags: null, DraftVersionID: null, PublishedVersionID: null, CreatedAt: "", CreatedBy: null, UpdatedAt: "", UpdatedBy: null }

describe("archive jobs", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks() })
  afterEach(() => { vi.useRealTimers() })

  it("polls an export job without flashing until the file is ready", async () => {
    mockGet
      .mockResolvedValueOnce({ State: "running" })
      .mockResolvedValueOnce({ State: "done", File: { FileID: "f1", Name: "a.cybericebox.zip", Size: 3, ChunkSize: 3, Chunks: 1 } })
    const result = waitForExportJob("j1")
    await vi.advanceTimersByTimeAsync(JOB_POLL_MS * 2)
    expect(await result).toEqual({ FileID: "f1", Name: "a.cybericebox.zip" })
    expect(mockGet).toHaveBeenCalledWith("/api/exercises/export/jobs/j1", { signal: undefined }, { silentOutage: true })
  })

  it("turns a failed export into an ApiError with the job's code and context", async () => {
    mockGet.mockResolvedValueOnce({ State: "failed", Error: { Code: 72830, Message: "m", Context: { reason: "unreachable", device: "web" } } })
    const result = waitForExportJob("j1")
    const caught = result.catch((e) => e)
    await vi.advanceTimersByTimeAsync(JOB_POLL_MS)
    const error = await caught
    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe(72830)
    expect(error.body).toEqual({ Status: { Code: 72830, Message: "m", Context: { reason: "unreachable", device: "web" } } })
    expect(error.status).toBe(409)
  })

  it("keeps asking through passing poll errors", async () => {
    mockGet
      .mockRejectedValueOnce(new ApiError(502, null))
      .mockRejectedValueOnce(new ApiError(429, null))
      .mockResolvedValueOnce({ State: "done", File: { FileID: "f1", Name: "a.zip" } })
    const result = waitForExportJob("j2")
    await vi.advanceTimersByTimeAsync(JOB_POLL_MS * 3)
    expect(await result).toEqual({ FileID: "f1", Name: "a.zip" })
    expect(mockGet).toHaveBeenCalledWith("/api/exercises/export/jobs/j2", { signal: undefined }, { silentOutage: true })
  })

  it("stops on a refused poll (job not found)", async () => {
    mockGet.mockRejectedValueOnce(new ApiError(404, { Status: { Code: 30992 } }, undefined, undefined, 30992))
    const caught = waitForExportJob("j2").catch((e) => e)
    await vi.advanceTimersByTimeAsync(JOB_POLL_MS)
    expect((await caught).code).toBe(30992)
  })

  it("a failed import with the zip text (20000) reads like the synchronous 400", async () => {
    mockGet.mockResolvedValueOnce({ State: "failed", Error: { Code: 20000, Message: "zip: not a valid zip file" } })
    expect((await getImportJob("j2")).error?.status).toBe(400)
  })

  it("aborts the wait", async () => {
    mockGet.mockResolvedValue({ State: "running" })
    const controller = new AbortController()
    const caught = waitForExportJob("j2", controller.signal).catch((e) => e)
    await vi.advanceTimersByTimeAsync(JOB_POLL_MS)
    controller.abort(new DOMException("x", "AbortError"))
    await vi.advanceTimersByTimeAsync(JOB_POLL_MS)
    expect((await caught).name).toBe("AbortError")
  })

  it("an export that outlasts the wait raises the export-stopped code 70998", async () => {
    mockGet.mockResolvedValue({ State: "running" })
    const caught = waitForExportJob("j1").catch((e) => e)
    await vi.advanceTimersByTimeAsync(JOB_MAX_WAIT_MS + JOB_POLL_MS * 2)
    expect((await caught).code).toBe(70998)
  })

  it("an internal failure (code 0) is a 500 without the backend's English text", async () => {
    mockGet.mockResolvedValueOnce({ State: "failed", Error: { Code: 0, Message: "Internal server error" } })
    const error = (await getImportJob("j2")).error!
    expect(error.status).toBe(500)
    expect(error.body).toEqual({ Status: { Code: 0 } })
    expect(exerciseErrorMessage(error)).toBe("Не вдалося виконати операцію")
  })

  it("reads a running import with its stage, counts and bytes", async () => {
    mockGet.mockResolvedValueOnce({ State: "running", Stage: "images", ImagesDone: 3, ImagesTotal: 7, TasksDone: 0, TasksTotal: 12, BytesPushed: 300, BytesTotal: 700 })
    expect(await getImportJob("j2")).toEqual({
      state: "running", stage: "images", imagesDone: 3, imagesTotal: 7, tasksDone: 0, tasksTotal: 12, bytesPushed: 300, bytesTotal: 700, exercises: [], error: undefined,
    })
    expect(mockGet).toHaveBeenCalledWith("/api/exercises/import/jobs/j2", { signal: undefined }, { silentOutage: true })
  })

  it("reads an import from a server that reports no progress as unpacking with zero counts", async () => {
    mockGet.mockResolvedValueOnce({ State: "running" })
    expect(await getImportJob("j2")).toMatchObject({ state: "running", stage: "unpacking", imagesTotal: 0, tasksTotal: 0 })
  })

  it("reads a finished import with its created tasks", async () => {
    mockGet.mockResolvedValueOnce({ State: "done", Stage: "done", TasksDone: 1, TasksTotal: 1, Exercises: [exercise] })
    const done = await getImportJob("j2")
    expect(done.state).toBe("done")
    expect(done.exercises[0]).toMatchObject({ ID: "e1", Tags: [] })
  })
})
