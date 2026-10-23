/**
 * archive.ts — portable exercise archives (.cybericebox.zip).
 *
 * Routes: POST /api/exercises/export (JSON → stored file, then downloaded in chunks),
 *         GET  /api/exercises/import/example (application/zip),
 *         GET  /api/exercises/import/example/document (JSON {Yaml, Json}: the guide's full example),
 *         POST /api/exercises/import (multipart: archive, password?, OwnerEventID?),
 *         POST /api/exercises/import/uploaded (JSON: FileID, Password, OwnerEventID) for an archive that went up in chunks,
 *         POST /api/exercises/import/upload (JSON: UploadID, Password, OwnerEventID) for an archive over 512 MiB (purpose exercise-archive).
 * OwnerEventID null imports into the platform catalog (admins); an event id into that event (its moderators).
 * With images an export (IncludeImages) and an import that names image files run as server jobs: the start answers
 * 202 {JobID}. An export is awaited by archiveJobs.ts; an import is handed to lib/importJobs.ts, which polls its
 * progress in the background.
 * Explicit archive targets may replace a working snapshot; legacy imports create new exercises.
 */
import { ApiError, apiGet, apiGetBlob, apiPost, apiPostMultipart } from "@/api/client"
import { waitForExportJob } from "@/api/exercises/archiveJobs"
import { SINGLE_REQUEST_MAX } from "@/api/exercises/files"
import { downloadInChunks } from "@/api/exercises/chunkedDownload"
import { forgetChunkedUpload, uploadChunks, uploadInChunks } from "@/api/exercises/chunkedUpload"
import { normalizeExercise, type Exercise, type RawExercise } from "@/api/exercises/catalog"

const BASE = "/api/exercises"

/** Backend limit per export request. */
export const EXPORT_LIMIT = 100

export type ExportInput = { IDs: string[]; IncludeSecrets: boolean; Password: string; IncludeImages?: boolean }
export type ExportedArchive = { blob: Blob; filename: string }

export type StoredExport = { FileID: string; Name: string }

/** What a long step is doing: sending the archive, or the server working on it in the background. */
export type ArchiveStage = "uploading" | "working"

/** An archive over this goes up as an exercise-archive upload (never assembled into one file). */
export const MAX_PLAIN_ARCHIVE_BYTES = 512 * 1024 * 1024
/** The media upload purpose of a task archive that may carry images (up to 512 MiB + 10 GiB). */
export const ARCHIVE_UPLOAD_PURPOSE = "exercise-archive"

type Started = { JobID: string }
const isJob = (answer: unknown): answer is Started => !!answer && !Array.isArray(answer) && typeof (answer as Started).JobID === "string"

/** Step 1: the server builds the archive and keeps it as a stored file (with images: a background job, awaited). */
export async function createExport(input: ExportInput, onStage?: (stage: ArchiveStage) => void, signal?: AbortSignal): Promise<StoredExport> {
  if (input.IDs.length === 0 || input.IDs.length > EXPORT_LIMIT) {
    throw new RangeError(`export accepts 1..${EXPORT_LIMIT} exercises`)
  }
  const body: ExportInput = input.IncludeSecrets ? { ...input } : { IDs: input.IDs, IncludeSecrets: false, Password: "" }
  if (input.IncludeImages) body.IncludeImages = true
  else delete body.IncludeImages
  const answer = await apiPost<StoredExport | Started>(`${BASE}/export`, body)
  if (isJob(answer)) {
    onStage?.("working")
    return waitForExportJob(answer.JobID, signal)
  }
  return { FileID: answer.FileID, Name: answer.Name }
}

/** Step 2: the stored archive comes down in chunks; a repeated call for the same file resumes. */
export async function downloadExport(stored: StoredExport, idCount: number, onProgress?: (percent: number) => void): Promise<ExportedArchive> {
  const { blob, name } = await downloadInChunks(stored.FileID, onProgress)
  return { blob, filename: name || stored.Name || (idCount === 1 ? "exercise.cybericebox.zip" : "exercises.cybericebox.zip") }
}

export async function exportExercises(input: ExportInput, onProgress?: (percent: number) => void, onStage?: (stage: ArchiveStage) => void): Promise<ExportedArchive> {
  return downloadExport(await createExport(input, onStage), input.IDs.length, onProgress)
}

/** A ready-to-import example task archive. */
export async function downloadImportExample(): Promise<ExportedArchive> {
  const { blob, filename } = await apiGetBlob(`${BASE}/import/example`)
  return { blob, filename: filename ?? "example-task.cybericebox.zip" }
}

/** What an import start came to: the tasks created at once, or (an archive naming image files) a job to follow. */
/** «unchanged»: an update the server skipped because the archive brought nothing new. */
export type ImportResult = { ItemKey: string; Mode: "new" | "update" | "unchanged"; ExerciseID: string }
export type ImportAnswer = RawExercise[] | null | { JobID: string } | { Exercises: RawExercise[] | null; Results: ImportResult[]; Created: number; Updated: number; Unchanged?: number }
export type ImportStart = { kind: "done"; exercises: Exercise[]; results?: ImportResult[]; created?: number; updated?: number; unchanged?: number } | { kind: "job"; jobID: string }

export function normalizeImportStart(answer: ImportAnswer): ImportStart {
  if (isJob(answer)) return { kind: "job", jobID: answer.JobID }
  if (answer && !Array.isArray(answer)) return { kind: "done", exercises: (answer.Exercises ?? []).map(normalizeExercise), results: answer.Results ?? [], created: answer.Created, updated: answer.Updated, unchanged: answer.Unchanged ?? 0 }
  return { kind: "done", exercises: (answer ?? []).map(normalizeExercise) }
}

const ERR_UPLOAD_NOT_FOUND = 31006

/** Sends the archive and starts its import; a background import is not awaited here. */
export async function startImport(
  file: File,
  password: string,
  onProgress?: (percent: number) => void,
  onStage?: (stage: ArchiveStage) => void,
  signal?: AbortSignal,
  ownerEventId: string | null = null,
): Promise<ImportStart> {
  // An archive that may carry images goes up in chunks as an exercise-archive upload and is read where its chunks
  // lie: the server never assembles it into one file. A repeated submit resumes the upload (and a failed job).
  if (file.size > MAX_PLAIN_ARCHIVE_BYTES) {
    onStage?.("uploading")
    const uploadID = await uploadChunks(file, onProgress, signal, { purpose: ARCHIVE_UPLOAD_PURPOSE })
    try {
      const answer = await apiPost<RawExercise[] | null | Started>(`${BASE}/import/upload`, { UploadID: uploadID, Password: password, OwnerEventID: ownerEventId })
      const started = normalizeImportStart(answer)
      // A job keeps its upload: a failed import runs again from it when the same file is submitted. The server drops
      // the upload of a finished import, so a stale id is only a 404 that starts the upload anew.
      if (started.kind === "done") forgetChunkedUpload(file, ARCHIVE_UPLOAD_PURPOSE)
      return started
    } catch (error) {
      if (error instanceof ApiError && error.code === ERR_UPLOAD_NOT_FOUND) forgetChunkedUpload(file, ARCHIVE_UPLOAD_PURPOSE)
      throw error
    }
  }
  // A request body is limited at the edge: a big archive goes up in chunks and is imported from the stored file.
  if (file.size > SINGLE_REQUEST_MAX) {
    onStage?.("uploading")
    const uploaded = await uploadInChunks(file, onProgress)
    return normalizeImportStart(await apiPost<RawExercise[] | null | Started>(`${BASE}/import/uploaded`, { FileID: uploaded.FileID, Password: password, OwnerEventID: ownerEventId }))
  }
  const form = new FormData()
  form.append("archive", file)
  if (password) form.append("password", password)
  if (ownerEventId) form.append("OwnerEventID", ownerEventId)
  return normalizeImportStart(await apiPostMultipart<RawExercise[] | null | Started>(`${BASE}/import`, form))
}

/** The full example task document in both formats (the real example/exercise.yaml and its JSON form). */
export type ImportExampleDocument = { Yaml: string; Json: string }

/** The guide's complete example: GET /import/example/document answers {Yaml, Json}; same rights as the example archive. */
export function getImportExampleDocument(): Promise<ImportExampleDocument> {
  return apiGet<ImportExampleDocument>(`${BASE}/import/example/document`)
}
