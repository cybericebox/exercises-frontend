/**
 * chunkedUpload.ts — resumable chunked upload through the API.
 *
 * A request body is limited to 100 MB at the edge, so a big file goes up in chunks of at most 50 MiB, in order:
 *   POST   /api/exercises/uploads                       start (name, type, size) → upload id, chunk size
 *   GET    /api/exercises/uploads/:id                   status: how many chunks the server holds
 *   PUT    /api/exercises/uploads/:id/chunks/:index     one raw chunk
 *   POST   /api/exercises/uploads/:id/complete          assemble; the backend checks the size and the sha256
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
const CHUNK_ATTEMPTS = 4
const BACKOFF_MS = 1000

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

type Options = { sleep?: (ms: number) => Promise<void>; restarts?: number }

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

function fileKey(file: File): string {
  return chunkedUploadKey(`${file.name}:${file.size}:${file.lastModified}`)
}

function isApiError(error: unknown, code: number): boolean {
  return error instanceof ApiError && error.code === code
}

/** Worth sending the chunk again: the connection failed or the server could not take it right now. */
function isTransient(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  if (error.body === null && error.status === 0) return error.message !== "Upload aborted"
  return error.status === 429 || error.status >= 500
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function openUpload(file: File, key: string): Promise<UploadStatus> {
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
  const started = await apiPost<UploadStatus>(UPLOADS, { Name: file.name, ContentType: file.type, Size: file.size })
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
  const sleep = options.sleep ?? defaultSleep
  const key = fileKey(file)
  const report = (sent: number) => onProgress?.(Math.min(99, Math.floor(sent / file.size * 100)))
  onProgress?.(0)

  let upload = await openUpload(file, key)
  // The hash of the whole file is computed on the way: chunks the server already has are read from the local
  // file again, only to feed the hash.
  const hasher = sha256.create()
  let received = upload.ChunksReceived
  for (let index = 0; index < upload.Chunks; index++) {
    const start = index * upload.ChunkSize
    const chunk = file.slice(start, Math.min(file.size, start + upload.ChunkSize))
    hasher.update(new Uint8Array(await chunk.arrayBuffer()))
    if (index < received) {
      report(start + chunk.size)
      continue
    }
    try {
      upload = await sendChunk(upload, index, chunk, (loaded) => report(start + loaded), signal, sleep)
    } catch (error) {
      if (isApiError(error, ERR_CHUNK_OUT_OF_ORDER) && (options.restarts ?? 0) < MAX_RESTARTS) {
        // Another tab or a lost answer: ask where the server stands, and start the whole loop over from there.
        return uploadInChunks(file, onProgress, signal, { ...options, restarts: (options.restarts ?? 0) + 1 })
      }
      if (isApiError(error, ERR_UPLOAD_NOT_FOUND)) writeStored(key, null)
      throw error
    }
    received = Math.max(received, upload.ChunksReceived)
    report(start + chunk.size)
  }

  try {
    const stored = await apiPost<UploadedFile>(`${UPLOADS}/${upload.UploadID}/complete`, { SHA256: bytesToHex(hasher.digest()) })
    writeStored(key, null)
    onProgress?.(100)
    return stored
  } catch (error) {
    // A file that does not match its hash is dropped by the server: the next try starts from nothing.
    if (error instanceof ApiError && (error.status === 400 || error.status === 404)) writeStored(key, null)
    throw error
  }
}

/** Gives up an upload: the server drops it with its chunks and the browser forgets it. */
export async function abandonChunkedUpload(file: File): Promise<void> {
  const key = fileKey(file)
  const stored = readStored(key)
  writeStored(key, null)
  if (stored) await apiDelete(`${UPLOADS}/${stored}`).catch(() => undefined)
}
