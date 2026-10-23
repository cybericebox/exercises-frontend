/**
 * chunkedUpload.ts — resumable chunked upload through the API.
 *
 * A request body is limited to 100 MB at the edge, so a big file goes up in chunks of at most 50 MiB, in order:
 *   POST   /api/exercises/uploads                       start (name, type, size) → upload id, chunk size
 *   GET    /api/exercises/uploads/:id                   status: how many chunks the server holds
 *   PUT    /api/exercises/uploads/:id/chunks/:index     one raw chunk
 *   POST   /api/exercises/uploads/:id/complete          assemble; the backend checks the size and the sha256
 * (uploadChunks stops before complete: an image blob is pushed to the registry from its chunks instead.)
 * An interrupted upload continues from the first chunk the server does not have: the upload id is kept in the
 * browser, keyed by the file, and a repeated call asks the server where it stands.
 */
import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex } from "@noble/hashes/utils.js"
import { ApiError, apiDelete, apiGet, apiPost } from "@/api/client"
import { sendXhr } from "@/api/exercises/xhr"
import type { UploadedFile } from "@/api/exercises/files"
import { chunkedUploadKey } from "@/lib/storageKeys"

const UPLOADS = "/api/exercises/uploads"

/** FullCodes of the media errors the upload reacts to (inform*10000 + object*100 + detail). */
const ERR_UPLOAD_NOT_FOUND = 31006
const ERR_CHUNK_OUT_OF_ORDER = 71007

/** A chunk is sent this many times before the upload gives up (the file stays resumable). */
export const CHUNK_ATTEMPTS = 4
export const BACKOFF_MS = 1000

type UploadStatus = {
  UploadID: string
  Name: string
  Size: number
  ChunkSize: number
  Chunks: number
  /** The index of the next chunk the server wants. */
  ChunksReceived: number
  ReceivedBytes: number
  ExpiresAt: string
}

type Options = {
  sleep?: (ms: number) => Promise<void>
  restarts?: number
  /** What the file is for, sent with the start request: "image-blob" lets the server take a file up to the image limit. */
  purpose?: string
}

/** How many times an upload that fell out of step with the server starts over from the server status. */
const MAX_RESTARTS = 3

function readStored(key: string): string | null {
  try { return window.localStorage.getItem(key) } catch { return null }
}

function writeStored(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch { /* A browser without storage still uploads; it just cannot resume after a reload. */ }
}

function fileKey(file: File, purpose?: string): string {
  // Archive preview requires an archive-purpose immutable source. A legacy file/image
  // upload of identical bytes cannot stand in for that source; preserve its own cache.
  const suffix = purpose === "exercise-archive" ? ":exercise-archive" : ""
  return chunkedUploadKey(`${file.name}:${file.size}:${file.lastModified}${suffix}`)
}

function isApiError(error: unknown, code: number): boolean {
  return error instanceof ApiError && error.code === code
}

/** Worth sending the chunk again: the connection failed or the server could not take it right now. */
export function isTransient(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  if (error.body === null && error.status === 0) return error.message !== "Upload aborted"
  return error.status === 429 || error.status >= 500
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function openUpload(file: File, key: string, purpose: string | undefined): Promise<UploadStatus> {
  const stored = readStored(key)
  if (stored) {
    try {
      return await apiGet<UploadStatus>(`${UPLOADS}/${stored}`)
    } catch (error) {
      // Dropped by the server (waited too long, finished): start again. Anything else is a real failure.
      if (!isApiError(error, ERR_UPLOAD_NOT_FOUND)) throw error
      writeStored(key, null)
    }
  }
  const started = await apiPost<UploadStatus>(UPLOADS, {
    Name: file.name, ContentType: file.type, Size: file.size, ...(purpose ? { Purpose: purpose } : {}),
  })
  writeStored(key, started.UploadID)
  return started
}

async function sendChunk(
  upload: UploadStatus,
  index: number,
  chunk: Blob,
  onProgress: (loaded: number) => void,
  signal: AbortSignal | undefined,
  sleep: (ms: number) => Promise<void>,
): Promise<UploadStatus> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await sendXhr<UploadStatus>("PUT", `${UPLOADS}/${upload.UploadID}/chunks/${index}`, {
        body: chunk,
        headers: { "Content-Type": "application/octet-stream" },
        signal,
        onUploadProgress: (loaded) => onProgress(loaded),
      })
    } catch (error) {
      if (attempt >= CHUNK_ATTEMPTS || !isTransient(error) || signal?.aborted) throw error
      onProgress(0)
      await sleep(BACKOFF_MS * 2 ** (attempt - 1))
    }
  }
}

type Sent = { upload: UploadStatus; key: string; hasher: ReturnType<typeof sha256.create> | null }

/**
 * Sends every chunk the server does not hold yet. With `hash`, the sha256 of the whole file is computed on the
 * way (chunks the server already has are read again, only to feed the hash); without it, those chunks are not read.
 */
async function sendChunks(
  file: File,
  onProgress: ((percent: number) => void) | undefined,
  signal: AbortSignal | undefined,
  options: Options,
  hash: boolean,
): Promise<Sent> {
  const sleep = options.sleep ?? defaultSleep
  const key = fileKey(file, options.purpose)
  const report = (sent: number) => onProgress?.(Math.min(99, Math.floor(sent / file.size * 100)))
  onProgress?.(0)

  let upload = await openUpload(file, key, options.purpose)
  const hasher = hash ? sha256.create() : null
  let received = upload.ChunksReceived
  for (let index = 0; index < upload.Chunks; index++) {
    const start = index * upload.ChunkSize
    const end = Math.min(file.size, start + upload.ChunkSize)
    if (index < received && !hasher) {
      report(end)
      continue
    }
    const chunk = file.slice(start, end)
    hasher?.update(new Uint8Array(await chunk.arrayBuffer()))
    if (index < received) {
      report(end)
      continue
    }
    try {
      upload = await sendChunk(upload, index, chunk, (loaded) => report(start + loaded), signal, sleep)
    } catch (error) {
      if (isApiError(error, ERR_CHUNK_OUT_OF_ORDER) && (options.restarts ?? 0) < MAX_RESTARTS) {
        // Another tab or a lost answer: ask where the server stands, and start the whole loop over from there.
        return sendChunks(file, onProgress, signal, { ...options, restarts: (options.restarts ?? 0) + 1 }, hash)
      }
      if (isApiError(error, ERR_UPLOAD_NOT_FOUND)) writeStored(key, null)
      throw error
    }
    received = Math.max(received, upload.ChunksReceived)
    report(end)
  }
  return { upload, key, hasher }
}

/**
 * Uploads the file in chunks and resolves with the stored file. Progress is 0–100 and stays below 100 until the
 * server has assembled and checked the file. A failed upload keeps its id: calling again resumes it.
 */
export async function uploadInChunks(
  file: File,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
  options: Options = {},
): Promise<UploadedFile> {
  const { upload, key, hasher } = await sendChunks(file, onProgress, signal, options, true)
  try {
    const stored = await apiPost<UploadedFile>(`${UPLOADS}/${upload.UploadID}/complete`, { SHA256: hasher ? bytesToHex(hasher.digest()) : "" })
    writeStored(key, null)
    onProgress?.(100)
    return stored
  } catch (error) {
    // A file that does not match its hash is dropped by the server: the next try starts from nothing.
    if (error instanceof ApiError && (error.status === 400 || error.status === 404)) writeStored(key, null)
    throw error
  }
}

/**
 * Sends every chunk of the file and resolves with the upload id, without completing the upload: the caller hands
 * the upload to another endpoint (an image blob is pushed to the registry from its chunks). The id stays in the
 * browser, so a repeated call resumes, or finds every chunk sent and sends nothing; forgetChunkedUpload drops it.
 */
export async function uploadChunks(
  file: File,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
  options: Options = {},
): Promise<string> {
  const { upload } = await sendChunks(file, onProgress, signal, options, false)
  onProgress?.(100)
  return upload.UploadID
}

/** Forgets the stored upload id of the file (the server is not asked): the next upload of the file starts anew. */
export function forgetChunkedUpload(file: File, purpose?: string): void {
  writeStored(fileKey(file, purpose), null)
}

/** Gives up an upload: the server drops it with its chunks and the browser forgets it. */
export async function abandonChunkedUpload(file: File): Promise<void> {
  const key = fileKey(file)
  const stored = readStored(key)
  writeStored(key, null)
  if (stored) await apiDelete(`${UPLOADS}/${stored}`).catch(() => undefined)
}
