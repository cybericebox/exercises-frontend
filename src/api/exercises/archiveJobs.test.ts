import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/api/client", async (original) => ({ ...(await original<typeof import("@/api/client")>()), apiGet: vi.fn() }))

import * as client from "@/api/client"
import { ApiError } from "@/api/client"
import { JOB_POLL_MS, waitForExportJob, waitForImportJob } from "./archiveJobs"

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
    expect(mockGet).toHaveBeenCalledWith("/api/exercises/export/jobs/j1", undefined, { silentOutage: true })
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
      .mockResolvedValueOnce({ State: "done", Exercises: [exercise] })
    const result = waitForImportJob("j2")
    await vi.advanceTimersByTimeAsync(JOB_POLL_MS * 3)
    const done = await result
    expect(done).toHaveLength(1)
    expect(done[0]).toMatchObject({ ID: "e1", Tags: [] })
    expect(mockGet).toHaveBeenCalledWith("/api/exercises/import/jobs/j2", undefined, { silentOutage: true })
  })

  it("stops on a refused poll (job not found)", async () => {
    mockGet.mockRejectedValueOnce(new ApiError(404, { Status: { Code: 30992 } }, undefined, undefined, 30992))
    const caught = waitForImportJob("j2").catch((e) => e)
    await vi.advanceTimersByTimeAsync(JOB_POLL_MS)
    expect((await caught).code).toBe(30992)
  })

  it("a failed import with the zip text (20000) reads like the synchronous 400", async () => {
    mockGet.mockResolvedValueOnce({ State: "failed", Error: { Code: 20000, Message: "zip: not a valid zip file" } })
    const caught = waitForImportJob("j2").catch((e) => e)
    await vi.advanceTimersByTimeAsync(JOB_POLL_MS)
    expect((await caught).status).toBe(400)
  })

  it("aborts the wait", async () => {
    mockGet.mockResolvedValue({ State: "running" })
    const controller = new AbortController()
    const caught = waitForImportJob("j2", controller.signal).catch((e) => e)
    await vi.advanceTimersByTimeAsync(JOB_POLL_MS)
    controller.abort(new DOMException("x", "AbortError"))
    await vi.advanceTimersByTimeAsync(JOB_POLL_MS)
    expect((await caught).name).toBe("AbortError")
  })
})
