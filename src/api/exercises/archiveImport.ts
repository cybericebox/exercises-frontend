import { apiGet, apiPost } from "@/api/client"
import { ARCHIVE_UPLOAD_PURPOSE, normalizeImportStart, type ImportAnswer } from "./archive"
import { uploadChunks } from "./chunkedUpload"

export type ArchiveImportSource = { UploadID: string; FileID?: never } | { FileID: string; UploadID?: never }
export type ImportTarget = { ItemKey: string; Mode: "new" | "update"; ExerciseID?: string }
export type ConfirmedImportUpdate = { ItemKey: string; Revision: string; ReplaceDraft: boolean }
export type ArchivePreviewInput = ArchiveImportSource & { Password: string; OwnerEventID?: string | null; FixedExerciseID?: string; Targets?: ImportTarget[] }
export type ArchiveCommitInput = ArchivePreviewInput & { Targets: ImportTarget[]; ConfirmedUpdates?: ConfirmedImportUpdate[] }
export type ImportTargetExercise = { ID: string; Name: string; Scope: string; OwnerEventID: string | null; OwnerEventName: string; OwnerEventTag: string; HasDraft: boolean }
export type ArchiveImportSummary = {
  Variants: { Added: number; Removed: number; Changed: number }
  Subtasks: { Before: number; After: number }
  FlagsChanged: number
  Files: { Added: number; Removed: number }
  Images: { New: number; Reused: number }
  MetadataChanged: boolean
}
export type ArchivePreviewItem = {
  ItemKey: string; SourceExerciseID: string | null; Name: string
  SourceVersion: { Position: number; Status: string }
  SuggestedTarget: ImportTarget; Target: ImportTarget; TargetExercise: ImportTargetExercise | null
  SourceIDMismatch: boolean; ConfirmationRevision: string; ReplacesDraft: boolean; Summary: ArchiveImportSummary
}
export type ArchiveImportPreview = { Items: ArchivePreviewItem[] }
export type ImportTargetPage = { Items: ImportTargetExercise[]; Total: number; NextCursor?: string }

/** The owned upload is immutable. Every preview and commit reuses this exact source. */
export async function prepareArchiveImport(file: File, onProgress?: (percent: number) => void, signal?: AbortSignal): Promise<ArchiveImportSource> {
  return { UploadID: await uploadChunks(file, onProgress, signal, { purpose: ARCHIVE_UPLOAD_PURPOSE }) }
}
export function previewArchiveImport(input: ArchivePreviewInput, signal?: AbortSignal): Promise<ArchiveImportPreview> {
  return apiPost("/api/exercises/import/preview", input, { signal })
}
export function listArchiveImportTargets({ search, cursor, pageSize = 50 }: { search: string; cursor?: string; pageSize?: number }, signal?: AbortSignal): Promise<ImportTargetPage> {
  const params = new URLSearchParams({ search })
  if (cursor) params.set("cursor", cursor)
  params.set("pageSize", String(pageSize))
  return apiGet(`/api/exercises/import/targets?${params}`, { signal })
}
export async function commitArchiveImport(input: ArchiveCommitInput) {
  return normalizeImportStart(await apiPost<ImportAnswer>(input.UploadID ? "/api/exercises/import/upload" : "/api/exercises/import/uploaded", input))
}
