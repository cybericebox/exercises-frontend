import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/api/client")
vi.mock("@/api/exercises/chunkedUpload", () => ({ uploadInChunks: vi.fn(), uploadChunks: vi.fn(), forgetChunkedUpload: vi.fn() }))
vi.mock("@/api/exercises/archiveJobs", () => ({ waitForExportJob: vi.fn() }))
vi.mock("@/api/exercises/chunkedDownload", () => ({ downloadInChunks: vi.fn() }))

import * as client from "@/api/client"
import { forgetChunkedUpload, uploadChunks, uploadInChunks } from "@/api/exercises/chunkedUpload"
import { waitForExportJob } from "@/api/exercises/archiveJobs"
import { downloadInChunks } from "@/api/exercises/chunkedDownload"
import { SINGLE_REQUEST_MAX } from "@/api/exercises/files"
import { ARCHIVE_UPLOAD_PURPOSE, MAX_PLAIN_ARCHIVE_BYTES, EXPORT_LIMIT, downloadImportExample, exportExercises, startImport } from "./archive"

const mockExportPost = vi.mocked(client.apiPost)
const mockDownload = vi.mocked(downloadInChunks)
const mockGetBlob = vi.mocked(client.apiGetBlob)
const mockMultipart = vi.mocked(client.apiPostMultipart)
const mockPost = vi.mocked(client.apiPost)
const mockChunks = vi.mocked(uploadInChunks)
const mockUploadChunks = vi.mocked(uploadChunks)
const mockForget = vi.mocked(forgetChunkedUpload)
const mockExportJob = vi.mocked(waitForExportJob)

describe("exercise archive client", () => {
  beforeEach(() => { vi.clearAllMocks() })

  const stored = { FileID: "f1", Name: "web-101.cybericebox.zip", Size: 3, ChunkSize: 3, Chunks: 1 }

  it("export downloads the stored archive in chunks", async () => {
    const blob = new Blob(["zip"])
    mockExportPost.mockResolvedValueOnce(stored)
    mockDownload.mockResolvedValueOnce({ blob, name: "web-101.cybericebox.zip" })
    const progress = vi.fn()
    const result = await exportExercises({ IDs: ["e1"], IncludeSecrets: false, Password: "ignored" }, progress)
    expect(mockExportPost).toHaveBeenCalledWith("/api/exercises/export", { IDs: ["e1"], IncludeSecrets: false, Password: "" })
    expect(mockDownload).toHaveBeenCalledWith("f1", progress)
    expect(result).toEqual({ blob, filename: "web-101.cybericebox.zip" })
  })

  it("sends the password only with secrets and falls back to a bundle name", async () => {
    mockExportPost.mockResolvedValueOnce({ ...stored, Name: "" })
    mockDownload.mockResolvedValueOnce({ blob: new Blob(["zip"]), name: "" })
    const result = await exportExercises({ IDs: ["e1", "e2"], IncludeSecrets: true, Password: "s3cret" })
    expect(mockExportPost).toHaveBeenCalledWith("/api/exercises/export", { IDs: ["e1", "e2"], IncludeSecrets: true, Password: "s3cret" })
    expect(result.filename).toBe("exercises.cybericebox.zip")
  })

  it("downloads the import example with the server file name", async () => {
    const blob = new Blob(["zip"])
    mockGetBlob.mockResolvedValueOnce({ blob, filename: "example-task.cybericebox.zip" })
    const result = await downloadImportExample()
    expect(mockGetBlob).toHaveBeenCalledWith("/api/exercises/import/example")
    expect(result).toEqual({ blob, filename: "example-task.cybericebox.zip" })
  })

  it("falls back to example-task.cybericebox.zip", async () => {
    mockGetBlob.mockResolvedValueOnce({ blob: new Blob(["zip"]), filename: null })
    expect((await downloadImportExample()).filename).toBe("example-task.cybericebox.zip")
  })

  it("rejects an empty or oversized selection before calling the API", async () => {
    await expect(exportExercises({ IDs: [], IncludeSecrets: false, Password: "" })).rejects.toBeInstanceOf(RangeError)
    const tooMany = Array.from({ length: EXPORT_LIMIT + 1 }, (_, i) => `e${i}`)
    await expect(exportExercises({ IDs: tooMany, IncludeSecrets: false, Password: "" })).rejects.toBeInstanceOf(RangeError)
    expect(mockExportPost).not.toHaveBeenCalled()
  })

  it("imports an archive as multipart with the optional password", async () => {
    mockMultipart.mockResolvedValueOnce([{
      ID: "e9", Name: "Imported", Description: "", Tags: null, DraftVersionID: null, PublishedVersionID: null,
      CreatedAt: "", CreatedBy: null, UpdatedAt: "", UpdatedBy: null,
    }])
    const file = new File(["zip"], "a.zip", { type: "application/zip" })
    const result = await startImport(file, "pw")
    const [path, form] = mockMultipart.mock.calls[0]
    expect(path).toBe("/api/exercises/import")
    expect((form as FormData).get("archive")).toBeInstanceOf(File)
    expect((form as FormData).get("password")).toBe("pw")
    expect(result.kind).toBe("done")
    expect(result.kind === "done" && result.exercises[0]).toMatchObject({ ID: "e9", Tags: [], ArchivedAt: null, HasChanges: false })
  })

  it("omits an empty password", async () => {
    mockMultipart.mockResolvedValueOnce([])
    await startImport(new File(["zip"], "a.zip"), "")
    expect((mockMultipart.mock.calls[0][1] as FormData).has("password")).toBe(false)
  })

  it("sends a big archive in chunks and imports from the stored file", async () => {
    mockChunks.mockResolvedValueOnce({ FileID: "f1", Name: "big.zip", Size: SINGLE_REQUEST_MAX + 1 })
    mockPost.mockResolvedValueOnce([])
    const big = new File(["zip"], "big.zip")
    Object.defineProperty(big, "size", { value: SINGLE_REQUEST_MAX + 1 })
    const progress = vi.fn()
    await startImport(big, "pw", progress)
    expect(mockChunks).toHaveBeenCalledWith(big, progress)
    expect(mockPost).toHaveBeenCalledWith("/api/exercises/import/uploaded", { FileID: "f1", Password: "pw", OwnerEventID: null })
    expect(mockMultipart).not.toHaveBeenCalled()
  })

  it("exports with images as a job: start, wait, then the chunked download", async () => {
    mockExportPost.mockResolvedValueOnce({ JobID: "j1" })
    mockExportJob.mockResolvedValueOnce({ FileID: "f2", Name: "img.cybericebox.zip" })
    mockDownload.mockResolvedValueOnce({ blob: new Blob(["zip"]), name: "img.cybericebox.zip" })
    const stage = vi.fn()
    const result = await exportExercises({ IDs: ["e1"], IncludeSecrets: false, Password: "", IncludeImages: true }, undefined, stage)
    expect(mockExportPost).toHaveBeenCalledWith("/api/exercises/export", { IDs: ["e1"], IncludeSecrets: false, Password: "", IncludeImages: true })
    expect(stage).toHaveBeenCalledWith("working")
    expect(mockExportJob).toHaveBeenCalledWith("j1", undefined)
    expect(mockDownload).toHaveBeenCalledWith("f2", undefined)
    expect(result.filename).toBe("img.cybericebox.zip")
  })

  it("does not send IncludeImages when it is off", async () => {
    mockExportPost.mockResolvedValueOnce(stored)
    mockDownload.mockResolvedValueOnce({ blob: new Blob(["zip"]), name: "x.zip" })
    await exportExercises({ IDs: ["e1"], IncludeSecrets: false, Password: "", IncludeImages: false })
    expect(mockExportPost).toHaveBeenCalledWith("/api/exercises/export", { IDs: ["e1"], IncludeSecrets: false, Password: "" })
    expect(mockExportJob).not.toHaveBeenCalled()
  })

  it("returns the job without waiting when a small archive names images", async () => {
    mockMultipart.mockResolvedValueOnce({ JobID: "j3" })
    const stage = vi.fn()
    expect(await startImport(new File(["zip"], "a.zip"), "", undefined, stage)).toEqual({ kind: "job", jobID: "j3" })
    expect(stage).not.toHaveBeenCalled()
  })

  it("returns the job of a chunk-uploaded archive", async () => {
    mockChunks.mockResolvedValueOnce({ FileID: "f1", Name: "big.zip", Size: SINGLE_REQUEST_MAX + 1 })
    mockPost.mockResolvedValueOnce({ JobID: "j4" })
    const big = new File(["zip"], "big.zip")
    Object.defineProperty(big, "size", { value: SINGLE_REQUEST_MAX + 1 })
    expect(await startImport(big, "pw")).toEqual({ kind: "job", jobID: "j4" })
  })

  it("sends an archive over 512 MiB as an exercise-archive upload and imports by upload id", async () => {
    mockUploadChunks.mockResolvedValueOnce("u1")
    mockPost.mockResolvedValueOnce({ JobID: "j5" })
    const huge = new File(["zip"], "huge.zip")
    Object.defineProperty(huge, "size", { value: MAX_PLAIN_ARCHIVE_BYTES + 1 })
    const progress = vi.fn()
    const stage = vi.fn()
    expect(await startImport(huge, "pw", progress, stage)).toEqual({ kind: "job", jobID: "j5" })
    expect(mockUploadChunks).toHaveBeenCalledWith(huge, progress, undefined, { purpose: ARCHIVE_UPLOAD_PURPOSE })
    expect(stage.mock.calls.map((c) => c[0])).toEqual(["uploading"])
    expect(mockPost).toHaveBeenCalledWith("/api/exercises/import/upload", { UploadID: "u1", Password: "pw", OwnerEventID: null })
    expect(mockChunks).not.toHaveBeenCalled()
    // The upload stays for a failed job to run again from it.
    expect(mockForget).not.toHaveBeenCalled()
  })

  it("a large archive without images is imported at once from the upload", async () => {
    mockUploadChunks.mockResolvedValueOnce("u1")
    mockPost.mockResolvedValueOnce([])
    const huge = new File(["zip"], "huge.zip")
    Object.defineProperty(huge, "size", { value: MAX_PLAIN_ARCHIVE_BYTES + 1 })
    expect(await startImport(huge, "")).toEqual({ kind: "done", exercises: [] })
    expect(mockForget).toHaveBeenCalledWith(huge)
  })

  it("keeps the upload for a retry when the import fails, and forgets one the server no longer has", async () => {
    mockUploadChunks.mockResolvedValue("u1")
    const huge = new File(["zip"], "huge.zip")
    Object.defineProperty(huge, "size", { value: MAX_PLAIN_ARCHIVE_BYTES + 1 })
    const registry = Object.assign(new client.ApiError(409, null), { code: 72801 })
    mockPost.mockRejectedValueOnce(registry)
    await expect(startImport(huge, "")).rejects.toBe(registry)
    expect(mockForget).not.toHaveBeenCalled()
    const gone = Object.assign(new client.ApiError(404, null), { code: 31006 })
    mockPost.mockRejectedValueOnce(gone)
    await expect(startImport(huge, "")).rejects.toBe(gone)
    expect(mockForget).toHaveBeenCalledWith(huge)
  })
})
