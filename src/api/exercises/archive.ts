/**
 * archive.ts — portable exercise archives (.cybericebox.zip).
 *
 * Routes: POST /api/exercises/export (JSON → application/zip),
 *         POST /api/exercises/import (multipart: archive, password?).
 * Import never overwrites: every archive creates new exercises.
 */
import { apiPostBlob, apiPostMultipart } from "@/api/client"
import { normalizeExercise, type Exercise, type RawExercise } from "@/api/exercises/catalog"

const BASE = "/api/exercises"

/** Backend limit per export request. */
export const EXPORT_LIMIT = 100

export type ExportInput = { IDs: string[]; IncludeSecrets: boolean; Password: string }
export type ExportedArchive = { blob: Blob; filename: string }

export async function exportExercises(input: ExportInput): Promise<ExportedArchive> {
  if (input.IDs.length === 0 || input.IDs.length > EXPORT_LIMIT) {
    throw new RangeError(`export accepts 1..${EXPORT_LIMIT} exercises`)
  }
  const body: ExportInput = input.IncludeSecrets ? input : { IDs: input.IDs, IncludeSecrets: false, Password: "" }
  const { blob, filename } = await apiPostBlob(`${BASE}/export`, body)
  const fallback = input.IDs.length === 1 ? "exercise.cybericebox.zip" : "exercises.cybericebox.zip"
  return { blob, filename: filename ?? fallback }
}

export async function importExercises(file: File, password: string): Promise<Exercise[]> {
  const form = new FormData()
  form.append("archive", file)
  if (password) form.append("password", password)
  const raw = await apiPostMultipart<RawExercise[] | null>(`${BASE}/import`, form)
  return (raw ?? []).map(normalizeExercise)
}
