import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/api/client")
vi.mock("@/api/exercises/chunkedUpload", () => ({ uploadInChunks: vi.fn() }))
vi.mock("@/api/exercises/chunkedDownload", () => ({ downloadInChunks: vi.fn() }))

import * as client from "@/api/client"
import { uploadInChunks } from "@/api/exercises/chunkedUpload"
import { downloadInChunks } from "@/api/exercises/chunkedDownload"
import { SINGLE_REQUEST_MAX } from "@/api/exercises/files"
import { EXPORT_LIMIT, downloadImportExample, exportExercises, importExercises } from "./archive"

const mockExportPost = vi.mocked(client.apiPost)
const mockDownload = vi.mocked(downloadInChunks)
const mockGetBlob = vi.mocked(client.apiGetBlob)
const mockMultipart = vi.mocked(client.apiPostMultipart)
const mockPost = vi.mocked(client.apiPost)
const mockChunks = vi.mocked(uploadInChunks)

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
    const result = await importExercises(file, "pw")
    const [path, form] = mockMultipart.mock.calls[0]
    expect(path).toBe("/api/exercises/import")
    expect((form as FormData).get("archive")).toBeInstanceOf(File)
    expect((form as FormData).get("password")).toBe("pw")
    expect(result[0]).toMatchObject({ ID: "e9", Tags: [], ArchivedAt: null, HasChanges: false })
  })

  it("omits an empty password", async () => {
    mockMultipart.mockResolvedValueOnce([])
    await importExercises(new File(["zip"], "a.zip"), "")
    expect((mockMultipart.mock.calls[0][1] as FormData).has("password")).toBe(false)
  })

  it("sends a big archive in chunks and imports from the stored file", async () => {
    mockChunks.mockResolvedValueOnce({ FileID: "f1", Name: "big.zip", Size: SINGLE_REQUEST_MAX + 1 })
    mockPost.mockResolvedValueOnce([])
    const big = new File(["zip"], "big.zip")
    Object.defineProperty(big, "size", { value: SINGLE_REQUEST_MAX + 1 })
    const progress = vi.fn()
    await importExercises(big, "pw", progress)
    expect(mockChunks).toHaveBeenCalledWith(big, progress)
    expect(mockPost).toHaveBeenCalledWith("/api/exercises/import/uploaded", { FileID: "f1", Password: "pw" })
    expect(mockMultipart).not.toHaveBeenCalled()
  })
})
