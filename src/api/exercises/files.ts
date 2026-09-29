/**
 * files.ts — attachment upload (multipart) and download URL.
 *
 * NOT via apiPost: request() in client.ts always sets Content-Type:
 * application/json, which breaks the multipart boundary. XHR exposes upload
 * progress while preserving the cookie-authenticated multipart contract.
 */
import { ApiError, redirectRequiredAuth } from "@/api/client"
import { apiOrigin } from "@/lib/origins"
import { isUnavailableStatus, reportServiceUnavailable } from "@/lib/serviceStatus"

const BASE_URL = apiOrigin
const FILES = "/api/exercises/files"

export type UploadedFile = { FileID: string; Name: string; Size: number }

/** Download URL (GET /api/exercises/files/:fileID, cookie-auth — suitable for <a href>). */
export function exerciseFileURL(fileId: string): string {
  return `${BASE_URL}${FILES}/${fileId}`
}

/** POST /api/exercises/files (multipart, field "file"). Progress is sent bytes, 0–100. */
export function uploadExerciseFile(file: File, onProgress?: (percent: number) => void): Promise<UploadedFile> {
  const form = new FormData()
  form.append("file", file)
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open("POST", `${BASE_URL}${FILES}`)
    request.withCredentials = true
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(Math.min(100, Math.round(event.loaded / event.total * 100)))
      }
    }
    request.onerror = () => {
      reportServiceUnavailable()
      reject(new ApiError(0, null, "Network error"))
    }
    request.onabort = () => reject(new ApiError(0, null, "Upload aborted"))
    request.onload = () => {
      if (isUnavailableStatus(request.status)) reportServiceUnavailable()
      if (request.status === 401) {
        redirectRequiredAuth(request.getResponseHeader("X-Sign-In-URL"))
        return
      }
      const raw = request.responseText
      let parsed: unknown = raw
      if (raw) {
        try { parsed = JSON.parse(raw) } catch { /* Preserve the raw response. */ }
      }
      const envelope = parsed && typeof parsed === "object"
        ? parsed as { Status?: { Code?: number; Message?: string }; Data?: unknown }
        : undefined
      if (request.status < 200 || request.status >= 300) {
        reject(new ApiError(request.status, parsed, envelope?.Status?.Message, request.getResponseHeader("X-Sign-In-URL") ?? undefined, envelope?.Status?.Code))
        return
      }
      onProgress?.(100)
      resolve((envelope ? envelope.Data : parsed) as UploadedFile)
    }
    request.send(form)
  })
}
