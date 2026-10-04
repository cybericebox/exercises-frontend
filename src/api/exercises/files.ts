/**
 * files.ts — attachment upload and download URL.
 *
 * A file up to SINGLE_REQUEST_MAX goes up in one multipart request; a larger one goes up in chunks (chunkedUpload.ts):
 * a request body is limited to 100 MB at the edge, and an interrupted chunked upload resumes.
 */
import { apiOrigin } from "@/lib/origins"
import { uploadInChunks } from "@/api/exercises/chunkedUpload"
import { sendXhr } from "@/api/exercises/xhr"

const BASE_URL = apiOrigin
const FILES = "/api/exercises/files"

export type UploadedFile = { FileID: string; Name: string; Size: number }

/** Above this a file goes up in chunks. The backend accepts a single request up to one chunk (50 MiB). */
export const SINGLE_REQUEST_MAX = 32 * 1024 * 1024

/** Download URL (GET /api/exercises/files/:fileID, cookie-auth — suitable for <a href>). The server answers Range. */
export function exerciseFileURL(fileId: string): string {
  return `${BASE_URL}${FILES}/${fileId}`
}

/**
 * Uploads the file. Progress is sent bytes, 0–100. A big file goes up in chunks and resumes on a repeated call
 * (the retry button) from the first chunk the server does not have.
 */
export function uploadExerciseFile(file: File, onProgress?: (percent: number) => void, signal?: AbortSignal): Promise<UploadedFile> {
  if (file.size > SINGLE_REQUEST_MAX) return uploadInChunks(file, onProgress, signal)
  const form = new FormData()
  form.append("file", file)
  return sendXhr<UploadedFile>("POST", FILES, {
    body: form,
    signal,
    onUploadProgress: (loaded, total) => onProgress?.(Math.min(100, Math.round(loaded / total * 100))),
  }).then((uploaded) => {
    onProgress?.(100)
    return uploaded
  })
}
