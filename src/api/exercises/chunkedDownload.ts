/**
 * chunkedDownload.ts — resumable chunked download of a stored file (the export archive).
 *
 *   GET /api/exercises/files/:id/meta             name, size, chunk size, chunk count, sha256
 *   GET /api/exercises/files/:id/chunks/:index    one raw chunk
 * Received chunks are kept in memory by file id: a repeated call after a failure continues from the first chunk
 * that is missing. The assembled bytes are checked against the sha256 of the meta; the cache is dropped after
 * a finished download (and after a mismatch, so the next try starts clean).
 */
import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex } from "@noble/hashes/utils.js"
import { apiGet, apiGetBlob } from "@/api/client"
import { BACKOFF_MS, CHUNK_ATTEMPTS, isTransient } from "@/api/exercises/chunkedUpload"

const FILES = "/api/exercises/files"

/** The assembled archive does not match the checksum of the stored file. */
export class DownloadHashMismatchError extends Error {
  constructor() {
    super("The downloaded archive does not match its checksum")
    this.name = "DownloadHashMismatchError"
  }
}

type FileMeta = { Name: string; Size: number; ChunkSize: number; Chunks: number; SHA256: string }
type Options = { sleep?: (ms: number) => Promise<void> }

/** Chunks received so far, by file id. */
const received = new Map<string, Blob[]>()

/** Drops the chunks kept for a file: the download will not be resumed. */
export function forgetDownload(fileId: string): void {
  received.delete(fileId)
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** A dropped connection is a network TypeError from fetch; a server hiccup is an ApiError. */
function retryable(error: unknown): boolean {
  return error instanceof TypeError || isTransient(error)
}

async function fetchChunk(fileId: string, index: number, sleep: (ms: number) => Promise<void>): Promise<Blob> {
  for (let attempt = 1; ; attempt++) {
    try {
      return (await apiGetBlob(`${FILES}/${fileId}/chunks/${index}`)).blob
    } catch (error) {
      if (attempt >= CHUNK_ATTEMPTS || !retryable(error)) throw error
      await sleep(BACKOFF_MS * 2 ** (attempt - 1))
    }
  }
}

export async function downloadInChunks(
  fileId: string,
  onProgress?: (percent: number) => void,
  options: Options = {},
): Promise<{ blob: Blob; name: string }> {
  const sleep = options.sleep ?? defaultSleep
  const meta = await apiGet<FileMeta>(`${FILES}/${fileId}/meta`)
  const chunks = received.get(fileId) ?? []
  received.set(fileId, chunks)
  const report = () => onProgress?.(meta.Chunks === 0 ? 100 : Math.min(100, Math.floor(chunks.length / meta.Chunks * 100)))
  report()
  while (chunks.length < meta.Chunks) {
    chunks.push(await fetchChunk(fileId, chunks.length, sleep))
    report()
  }

  const hasher = sha256.create()
  for (const chunk of chunks) hasher.update(new Uint8Array(await chunk.arrayBuffer()))
  received.delete(fileId)
  if (bytesToHex(hasher.digest()) !== meta.SHA256) throw new DownloadHashMismatchError()
  onProgress?.(100)
  return { blob: new Blob(chunks, { type: "application/zip" }), name: meta.Name }
}
