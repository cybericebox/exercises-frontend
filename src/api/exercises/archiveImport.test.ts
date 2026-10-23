import { beforeEach, expect, it, vi } from "vitest"
vi.mock("@/api/client", () => ({ apiPost: vi.fn(), apiGet: vi.fn() }))
vi.mock("@/api/exercises/chunkedUpload", () => ({ uploadChunks: vi.fn(), forgetChunkedUpload: vi.fn() }))
import { apiGet, apiPost } from "@/api/client"
import { uploadChunks } from "@/api/exercises/chunkedUpload"
import { prepareArchiveImport, previewArchiveImport, commitArchiveImport, listArchiveImportTargets } from "./archiveImport"
beforeEach(() => vi.clearAllMocks())
it.each([3, 600 * 1024 * 1024])("prepares immutable archive-purpose source at size %s without assembly", async size => {
 const file = new File(["zip"], "a.zip"); Object.defineProperty(file, "size", { value: size })
 vi.mocked(uploadChunks).mockResolvedValue("owned")
 expect(await prepareArchiveImport(file)).toEqual({ UploadID: "owned" })
 expect(uploadChunks).toHaveBeenCalledWith(file, undefined, undefined, { purpose: "exercise-archive" })
 expect(apiPost).not.toHaveBeenCalled()
})
it("reuses one source for suggestions, explicit choices and revision-bound commit", async () => {
 const source = { UploadID: "u", Password: "pw", FixedExerciseID: "fixed", OwnerEventID: null }
 vi.mocked(apiPost).mockResolvedValueOnce({ Items: [] }).mockResolvedValueOnce({ Items: [] }).mockResolvedValueOnce({ Exercises: [], Results: [{ ItemKey: "folder", Mode: "update", ExerciseID: "fixed" }], Created: 0, Updated: 1 })
 await previewArchiveImport(source)
 const explicit = { ...source, Targets: [{ ItemKey: "folder", Mode: "update" as const, ExerciseID: "fixed" }] }
 await previewArchiveImport(explicit)
 const input = { ...explicit, ConfirmedUpdates: [{ ItemKey: "folder", Revision: "revision", ReplaceDraft: true }] }
 expect(await commitArchiveImport(input)).toMatchObject({ kind: "done", results: [{ ExerciseID: "fixed" }], created: 0, updated: 1 })
 expect(apiPost).toHaveBeenNthCalledWith(1, "/api/exercises/import/preview", source, { signal: undefined })
 expect(apiPost).toHaveBeenLastCalledWith("/api/exercises/import/upload", input)
})
it("keeps server cursor/search policy and stored-file commit route", async () => {
 vi.mocked(apiGet).mockResolvedValue({ Items: [], NextCursor: "next", HasMore: true, Total: 9 })
 await listArchiveImportTargets({ search: "name & owner", cursor: "last", pageSize: 25 })
 expect(apiGet).toHaveBeenCalledWith("/api/exercises/import/targets?search=name+%26+owner&cursor=last&pageSize=25", { signal: undefined })
 vi.mocked(apiPost).mockResolvedValue({ JobID: "j" })
 expect(await commitArchiveImport({ FileID: "f", Password: "", Targets: [] })).toEqual({ kind: "job", jobID: "j" })
 expect(apiPost).toHaveBeenLastCalledWith("/api/exercises/import/uploaded", { FileID: "f", Password: "", Targets: [] })
})
