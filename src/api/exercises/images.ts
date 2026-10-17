/**
 * images.ts — uploads a `docker save` archive to the platform image registry.
 *
 *   POST /api/exercises/:id/images/blobs/missing   {Digests}                   → {Missing}: blobs the registry lacks
 *   (chunked upload of each missing blob, purpose "image-blob", never completed)
 *   POST /api/exercises/:id/images/blobs           {UploadID, Digest, Size}    → 200 {State:"present"} | 202 {State:"pushing"}
 *   GET  /api/exercises/:id/images/blobs/:digest                               → {State, Reason?} while a push runs
 *   POST /api/exercises/:id/images                 {Name, Config, Layers}      → {Reference}: platform:<name>@sha256:<hex>
 *
 * Only the blobs the registry lacks travel. Each blob is a slice of the archive with a stable name, so its upload id
 * stays in the browser and an interrupted upload resumes after a reload (the same archive dropped again). The
 * server pushes a staged blob to the registry in the background; the image is created only once every blob is there.
 */
import { ApiError, apiGet, apiPost } from "@/api/client"
import { forgetChunkedUpload, uploadChunks } from "./chunkedUpload"
import { type BlobEntry, readImageArchive } from "@/lib/imageArchive"

const BASE = "/api/exercises"

/** The media upload purpose that lets a staged file be as large as an image archive. */
export const IMAGE_BLOB_PURPOSE = "image-blob"

/** How often a background push is asked about. */
export const BLOB_POLL_MS = 3000
/** The longest wait for the background pushes of one image (the server calls a push silent for 3 h failed). */
export const BLOB_PUSH_MAX_WAIT_MS = 3 * 60 * 60 * 1000
/** How many times a push that failed for a passing reason is asked for again with the same upload. */
const MAX_PUSH_RETRIES = 3

/** FullCodes of POST …/images/blobs answers after which the blob is uploaded again (once). */
const ERR_STAGED_BLOB_NOT_FOUND = 32818
const ERR_BLOB_UPLOAD_NOT_READY = 72820
const ERR_BLOB_DIGEST_MISMATCH = 22816

/** Reasons of a failed push that pass: the same upload is pushed again. */
const RETRYABLE = new Set(["unreachable", "rate_limited"])
/** Reasons of a failed push after which the blob is uploaded again. */
const REUPLOAD = new Set(["digest_mismatch", "upload_missing"])

/** What the upload is doing: sending the missing bytes, or waiting for the registry to take them. */
export type ImageUploadStage = "uploading" | "pushing"

/**
 * A blob the registry did not take. `reason` is the server's (`unauthorized`, `unreachable`, `rate_limited`,
 * `not_found`, `not_configured`, `digest_mismatch`, `upload_missing`) or `timeout` when the wait ran out.
 */
export class ImagePushError extends Error {
  constructor(public readonly reason: string) {
    super(`image blob push: ${reason}`)
    this.name = "ImagePushError"
  }
}

type Descriptor = { MediaType: string; Digest: string; Size: number }
type BlobState = { State: string; Reason?: string }

const descriptor = (blob: BlobEntry): Descriptor => ({ MediaType: blob.mediaType, Digest: blob.digest, Size: blob.size })

/** A blob of the archive as a file: the name and lastModified stay the same across reloads, so the upload resumes. */
function blobFile(file: File, blob: BlobEntry): File {
  return new File([file.slice(blob.offset, blob.offset + blob.size)], `sha256-${blob.digest.slice("sha256:".length)}`, {
    type: "application/octet-stream",
    lastModified: 0,
  })
}

/** Waits, or rejects with the abort reason as soon as the signal fires. */
function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

/** The status request failed on the way (network, rate limit, server trouble): ask again on the next round. */
function isPassing(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  return error.status === 0 || error.status === 429 || error.status >= 500
}

const hasCode = (error: unknown, code: number) => error instanceof ApiError && error.code === code

/** One missing blob on its way to the registry. */
type Pending = { blob: BlobEntry; file: File; uploadID: string; reuploaded: boolean; retries: number }

/**
 * Uploads the image in the archive and resolves with its platform reference. Progress is 0–100 over the bytes
 * that actually travel (blobs the registry already has do not count); it stays at 99 with the "pushing" stage
 * while the registry takes the blobs, and reaches 100 once the image exists.
 * Throws ImageArchiveError for an archive that cannot be used, ImagePushError when the registry does not take a
 * blob, ApiError for a refused request, and the abort reason when the signal fires.
 */
export async function uploadImage(
  exerciseID: string,
  file: File,
  name: string,
  onProgress?: (percent: number, stage: ImageUploadStage) => void,
  signal?: AbortSignal,
): Promise<string> {
  const base = `${BASE}/${exerciseID}/images`
  const init = { signal }
  let last = ""
  let stage: ImageUploadStage = "uploading"
  const report = (percent: number) => {
    const key = `${percent}:${stage}`
    if (key === last) return
    last = key
    onProgress?.(percent, stage)
  }

  const archive = await readImageArchive(file)
  signal?.throwIfAborted()
  const unique = new Map<string, BlobEntry>()
  for (const blob of [archive.config, ...archive.layers]) if (!unique.has(blob.digest)) unique.set(blob.digest, blob)

  const answer = await apiPost<{ Missing: string[] | null }>(`${base}/blobs/missing`, { Digests: [...unique.keys()] }, init)
  const missing = new Set(answer.Missing ?? [])
  const toSend = [...unique.values()].filter((blob) => missing.has(blob.digest))
  const total = toSend.reduce((sum, blob) => sum + blob.size, 0)
  let done = 0
  const bytes = (sent: number) => report(total === 0 ? 99 : Math.min(99, Math.floor(sent / total * 100)))

  /** Asks the server to push the staged blob; a present blob is done, and the browser forgets its upload. */
  const push = async (entry: Pending): Promise<boolean> => {
    const { State } = await apiPost<BlobState>(`${base}/blobs`, { UploadID: entry.uploadID, Digest: entry.blob.digest, Size: entry.blob.size }, init)
    if (State !== "present") return false
    forgetChunkedUpload(entry.file)
    return true
  }

  /**
   * Asks for the push; when the staged upload is lost, broken or short of chunks, the blob is uploaded again
   * (once per blob) and handed over again.
   */
  const handOver = async (entry: Pending, onBytes: (percent: number) => void): Promise<boolean> => {
    try {
      return await push(entry)
    } catch (error) {
      const again = hasCode(error, ERR_STAGED_BLOB_NOT_FOUND) || hasCode(error, ERR_BLOB_DIGEST_MISMATCH) || hasCode(error, ERR_BLOB_UPLOAD_NOT_READY)
      if (!again || entry.reuploaded) throw error
      entry.reuploaded = true
      // Not ready = chunks missing: resume them. Otherwise the staged upload is gone or wrong: start anew.
      if (!hasCode(error, ERR_BLOB_UPLOAD_NOT_READY)) forgetChunkedUpload(entry.file)
      return send(entry, onBytes)
    }
  }

  /** Uploads the blob's missing chunks and hands them over. */
  const send = async (entry: Pending, onBytes: (percent: number) => void): Promise<boolean> => {
    signal?.throwIfAborted()
    entry.uploadID = await uploadChunks(entry.file, onBytes, signal, { purpose: IMAGE_BLOB_PURPOSE })
    signal?.throwIfAborted()
    return handOver(entry, onBytes)
  }

  /** Byte progress of one blob sent again while the others wait for the registry: the stage goes back to uploading. */
  const resend = (percent: number) => {
    if (stage !== "uploading") {
      stage = "uploading"
      report(0)
    }
    report(Math.min(99, Math.floor(percent)))
  }

  report(0)
  const pushing: Pending[] = []
  for (const blob of toSend) {
    const entry: Pending = { blob, file: blobFile(file, blob), uploadID: "", reuploaded: false, retries: 0 }
    const present = await send(entry, (percent) => bytes(done + blob.size * percent / 100))
    if (!present) pushing.push(entry)
    done += blob.size
    bytes(done)
  }

  if (pushing.length > 0) {
    stage = "pushing"
    report(99)
    const deadline = Date.now() + BLOB_PUSH_MAX_WAIT_MS
    while (pushing.length > 0) {
      await wait(BLOB_POLL_MS, signal)
      for (const entry of [...pushing]) {
        let status: BlobState
        try {
          // A failed poll is asked again next round, so it is not reported as a platform outage.
          status = await apiGet<BlobState>(`${base}/blobs/${encodeURIComponent(entry.blob.digest)}`, init, { silentOutage: true, retry: false })
        } catch (error) {
          if (isPassing(error) && !signal?.aborted) continue
          throw error
        }
        let present = status.State === "present"
        if (status.State === "missing" || (status.State === "failed" && RETRYABLE.has(status.Reason ?? ""))) {
          if (entry.retries >= MAX_PUSH_RETRIES) throw new ImagePushError(status.Reason || "unreachable")
          entry.retries++
          present = await handOver(entry, resend)
        } else if (status.State === "failed" && REUPLOAD.has(status.Reason ?? "")) {
          if (entry.reuploaded) throw new ImagePushError(status.Reason ?? "")
          entry.reuploaded = true
          forgetChunkedUpload(entry.file)
          present = await send(entry, resend)
        } else if (status.State === "failed") {
          throw new ImagePushError(status.Reason || "unreachable")
        } else if (status.State === "present") {
          forgetChunkedUpload(entry.file)
        }
        if (stage !== "pushing") {
          stage = "pushing"
          report(99)
        }
        if (present) pushing.splice(pushing.indexOf(entry), 1)
      }
      if (pushing.length > 0 && Date.now() >= deadline) throw new ImagePushError("timeout")
    }
  }

  signal?.throwIfAborted()
  const created = await apiPost<{ Reference: string }>(base, {
    Name: name,
    Config: descriptor(archive.config),
    Layers: archive.layers.map(descriptor),
  }, init)
  report(100)
  return created.Reference
}
