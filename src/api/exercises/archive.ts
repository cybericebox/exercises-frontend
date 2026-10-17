/**
 * archive.ts — portable exercise archives (.cybericebox.zip).
 *
 * Routes: POST /api/exercises/export (JSON → stored file, then downloaded in chunks),
 *         GET  /api/exercises/import/example (application/zip),
 *         POST /api/exercises/import (multipart: archive, password?),
 *         POST /api/exercises/import/uploaded (JSON: FileID, Password) for an archive that went up in chunks.
 * Import never overwrites: every archive creates new exercises.
 */
import { apiGetBlob, apiPost, apiPostMultipart } from "@/api/client"
import { SINGLE_REQUEST_MAX } from "@/api/exercises/files"
import { downloadInChunks } from "@/api/exercises/chunkedDownload"
import { uploadInChunks } from "@/api/exercises/chunkedUpload"
import { normalizeExercise, type Exercise, type RawExercise } from "@/api/exercises/catalog"

const BASE = "/api/exercises"

/** Backend limit per export request. */
export const EXPORT_LIMIT = 100

export type ExportInput = { IDs: string[]; IncludeSecrets: boolean; Password: string }
export type ExportedArchive = { blob: Blob; filename: string }

export type StoredExport = { FileID: string; Name: string }

/** Step 1: the server builds the archive and keeps it as a stored file. */
export async function createExport(input: ExportInput): Promise<StoredExport> {
  if (input.IDs.length === 0 || input.IDs.length > EXPORT_LIMIT) {
    throw new RangeError(`export accepts 1..${EXPORT_LIMIT} exercises`)
  }
  const body: ExportInput = input.IncludeSecrets ? input : { IDs: input.IDs, IncludeSecrets: false, Password: "" }
  const stored = await apiPost<StoredExport>(`${BASE}/export`, body)
  return { FileID: stored.FileID, Name: stored.Name }
}

/** Step 2: the stored archive comes down in chunks; a repeated call for the same file resumes. */
export async function downloadExport(stored: StoredExport, idCount: number, onProgress?: (percent: number) => void): Promise<ExportedArchive> {
  const { blob, name } = await downloadInChunks(stored.FileID, onProgress)
  return { blob, filename: name || stored.Name || (idCount === 1 ? "exercise.cybericebox.zip" : "exercises.cybericebox.zip") }
}

export async function exportExercises(input: ExportInput, onProgress?: (percent: number) => void): Promise<ExportedArchive> {
  return downloadExport(await createExport(input), input.IDs.length, onProgress)
}

/** A ready-to-import example task archive. */
export async function downloadImportExample(): Promise<ExportedArchive> {
  const { blob, filename } = await apiGetBlob(`${BASE}/import/example`)
  return { blob, filename: filename ?? "example-task.cybericebox.zip" }
}

export async function importExercises(file: File, password: string, onProgress?: (percent: number) => void): Promise<Exercise[]> {
  // A request body is limited at the edge: a big archive goes up in chunks and is imported from the stored file.
  if (file.size > SINGLE_REQUEST_MAX) {
    const uploaded = await uploadInChunks(file, onProgress)
    const raw = await apiPost<RawExercise[] | null>(`${BASE}/import/uploaded`, { FileID: uploaded.FileID, Password: password })
    return (raw ?? []).map(normalizeExercise)
  }
  const form = new FormData()
  form.append("archive", file)
  if (password) form.append("password", password)
  const raw = await apiPostMultipart<RawExercise[] | null>(`${BASE}/import`, form)
  return (raw ?? []).map(normalizeExercise)
}
