/**
 * imageCompression.ts — prepares a `docker save` archive for upload in the browser:
 *   - a .tar.gz is unpacked to a temporary file first (OPFS), then read like a .tar;
 *   - each plain layer is gzipped (CompressionStream in a Web Worker) into a temporary file with its sha256, so
 *     fewer bytes leave the browser. `rootfs.diff_ids` of the image config stay the digests of the uncompressed layers.
 * A browser without Worker, CompressionStream or OPFS, or without room, uploads the layers as they are (no error).
 * Temporary files live in the OPFS directory below and are removed after the upload, on cancel and on failure.
 */
import { type BlobEntry, ImageArchiveError, MAX_IMAGE_ARCHIVE_BYTES, readImageArchive, type ImageArchive } from "@/lib/imageArchive"

/** The layer media type that is compressed; anything else (an already compressed layer) is sent as it is. */
export const PLAIN_LAYER = "application/vnd.oci.image.layer.v1.tar"
export const GZIP_LAYER = "application/vnd.oci.image.layer.v1.tar+gzip"

const TMP_DIR = "cybericebox-image-upload"
/** Temporary files older than this are leftovers of a closed tab. */
const STALE_MS = 24 * 60 * 60 * 1000
/** A .tar.gz is assumed to unpack to at most this many times its size when checking free space up front. */
const UNPACK_RATIO = 3

export type Compressed = { digest: string; size: number; file: File; tempName: string }

/** The storage and the workers that do the work; the default is the browser's, tests pass their own. */
export type CompressionEngine = {
  /** Free bytes of the origin's quota, or null when the browser does not say. */
  freeBytes(): Promise<number | null>
  compress(blob: Blob, options: { signal?: AbortSignal; onRead?: (read: number) => void }): Promise<Compressed>
  unpack(file: Blob, options: { maxBytes: number; signal?: AbortSignal; onBytes?: (written: number) => void }): Promise<{ file: File; tempName: string }>
  remove(names: string[]): Promise<void>
  /** Removes temporary files of earlier runs that were never cleaned up. */
  purgeStale(): Promise<void>
}

type WorkerReply = { type: "progress"; id: number; read: number } | { type: "done"; id: number; digest?: string; size: number } | { type: "error"; id: number; code: string }

let nextId = 1

function aborted(signal?: AbortSignal): unknown {
  return signal?.reason ?? new DOMException("aborted", "AbortError")
}

function newName(extension: string): string {
  return `${crypto.randomUUID()}.${extension}`
}

async function tmpDir(): Promise<FileSystemDirectoryHandle> {
  return (await navigator.storage.getDirectory()).getDirectoryHandle(TMP_DIR, { create: true })
}

/** One worker job: resolves with the final reply, or rejects with the error the worker reported. */
function job(message: Record<string, unknown>, options: { signal?: AbortSignal; onRead?: (read: number) => void }): Promise<Extract<WorkerReply, { type: "done" }>> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) { reject(aborted(options.signal)); return }
    const id = nextId++
    const worker = new Worker(new URL("./layerCompression.worker.ts", import.meta.url), { type: "module" })
    const finish = () => {
      options.signal?.removeEventListener("abort", onAbort)
      worker.terminate()
    }
    const onAbort = () => {
      worker.postMessage({ type: "abort", id })
      finish()
      reject(aborted(options.signal))
    }
    options.signal?.addEventListener("abort", onAbort, { once: true })
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data
      if (reply.id !== id) return
      if (reply.type === "progress") { options.onRead?.(reply.read); return }
      finish()
      if (reply.type === "done") { resolve(reply); return }
      if (reply.code === "tooLarge") reject(new ImageArchiveError("tooLarge"))
      else if (reply.code === "quota") reject(new DOMException("no space", "QuotaExceededError"))
      else if (reply.code === "aborted") reject(aborted(options.signal))
      else reject(new Error("image compression failed"))
    }
    worker.onerror = () => { finish(); reject(new Error("image compression failed")) }
    worker.postMessage({ ...message, id, dir: TMP_DIR })
  })
}

async function readTemp(name: string, fileName: string): Promise<File> {
  const handle = await (await tmpDir()).getFileHandle(name)
  const stored = await handle.getFile()
  // A stable name and time: the chunked upload recognises the same blob after a reload and resumes.
  return new File([stored], fileName, { type: "application/octet-stream", lastModified: 0 })
}

/** The browser's engine, or null when it lacks a Web Worker, CompressionStream or OPFS. */
export function browserEngine(): CompressionEngine | null {
  if (typeof Worker === "undefined" || typeof CompressionStream === "undefined" || typeof DecompressionStream === "undefined") return null
  if (typeof navigator === "undefined" || typeof navigator.storage?.getDirectory !== "function") return null
  return {
    async freeBytes() {
      try {
        const { quota, usage } = await navigator.storage.estimate()
        return quota === undefined || usage === undefined ? null : Math.max(0, quota - usage)
      } catch { return null }
    },
    async compress(blob, options) {
      const tempName = newName("gz")
      try {
        const done = await job({ type: "compress", name: tempName, blob }, options)
        const digest = done.digest ?? ""
        return { digest, size: done.size, tempName, file: await readTemp(tempName, `sha256-${digest.slice("sha256:".length)}`) }
      } catch (error) {
        await this.remove([tempName])
        throw error
      }
    },
    async unpack(file, options) {
      const tempName = newName("tar")
      try {
        await job({ type: "unpack", name: tempName, blob: file, maxBytes: options.maxBytes }, { signal: options.signal, onRead: options.onBytes })
        const stored = await (await (await tmpDir()).getFileHandle(tempName)).getFile()
        return { file: stored, tempName }
      } catch (error) {
        await this.remove([tempName])
        throw error
      }
    },
    async remove(names) {
      try {
        const dir = await tmpDir()
        await Promise.all(names.map((name) => dir.removeEntry(name).catch(() => undefined)))
      } catch { /* nothing to remove */ }
    },
    async purgeStale() {
      try {
        const dir = await tmpDir()
        for await (const entry of dir.values()) {
          if (entry.kind !== "file") continue
          const stored = await (entry as FileSystemFileHandle).getFile()
          if (Date.now() - stored.lastModified > STALE_MS) await dir.removeEntry(entry.name).catch(() => undefined)
        }
      } catch { /* the directory is not there */ }
    },
  }
}

export type PreparedImage = {
  archive: ImageArchive
  /** The file the archive offsets point into (the unpacked tar for a .tar.gz). */
  source: File
  /** Removes the temporary unpacked tar. */
  release: () => Promise<void>
}

/** True for a file that starts with the gzip magic. */
export async function isGzip(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer())
  return head.length === 2 && head[0] === 0x1f && head[1] === 0x8b
}

/**
 * Reads the archive. A .tar.gz is unpacked to a temporary file first: with no room for it, or in a browser that
 * cannot unpack, it is refused (`noSpace` / `gzip`) because the layers need a seekable tar.
 */
export async function prepareImage(file: File, options: {
  engine?: CompressionEngine | null
  signal?: AbortSignal
  onUnpack?: (percent: number) => void
} = {}): Promise<PreparedImage> {
  const engine = options.engine === undefined ? browserEngine() : options.engine
  if (!(await isGzip(file))) return { archive: await readImageArchive(file), source: file, release: async () => undefined }
  if (file.size > MAX_IMAGE_ARCHIVE_BYTES) throw new ImageArchiveError("tooLarge")
  if (!engine) throw new ImageArchiveError("gzip")
  await engine.purgeStale()
  const free = await engine.freeBytes()
  if (free !== null && free < file.size * UNPACK_RATIO) throw new ImageArchiveError("noSpace")
  let unpacked: { file: File; tempName: string }
  try {
    unpacked = await engine.unpack(file, {
      maxBytes: MAX_IMAGE_ARCHIVE_BYTES,
      signal: options.signal,
      onBytes: (written) => options.onUnpack?.(Math.min(99, Math.floor(written / (file.size * 2) * 100))),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "QuotaExceededError") throw new ImageArchiveError("noSpace")
    throw error
  }
  const release = () => engine.remove([unpacked.tempName])
  try {
    return { archive: await readImageArchive(unpacked.file), source: unpacked.file, release }
  } catch (error) {
    await release()
    throw error
  }
}

export type CompressedLayers = {
  /** By the digest of the uncompressed layer (its diff id). */
  byDiffId: Map<string, Compressed>
  release: () => Promise<void>
}

/**
 * Gzips the plain layers of the archive one at a time into temporary files. Resolves with null when the layers
 * should be sent as they are: no engine, no room, or the compression failed on the way (never a reason to refuse
 * the upload). `onProgress` gets the percent of layer bytes read and the layer being worked on (1-based).
 */
export async function compressLayers(source: File, archive: ImageArchive, options: {
  engine?: CompressionEngine | null
  signal?: AbortSignal
  onProgress?: (percent: number, layer: number, layers: number) => void
} = {}): Promise<CompressedLayers | null> {
  const engine = options.engine === undefined ? browserEngine() : options.engine
  if (!engine) return null
  const plain = new Map<string, BlobEntry>()
  for (const layer of archive.layers) if (layer.mediaType === PLAIN_LAYER && !plain.has(layer.digest)) plain.set(layer.digest, layer)
  if (plain.size === 0) return null
  const total = [...plain.values()].reduce((sum, layer) => sum + layer.size, 0)
  const free = await engine.freeBytes()
  if (free !== null && free < total) return null
  await engine.purgeStale()

  const byDiffId = new Map<string, Compressed>()
  const release = () => engine.remove([...byDiffId.values()].map((layer) => layer.tempName))
  let before = 0
  let index = 0
  try {
    for (const layer of plain.values()) {
      options.signal?.throwIfAborted()
      index++
      const done = before
      const result = await engine.compress(source.slice(layer.offset, layer.offset + layer.size), {
        signal: options.signal,
        onRead: (read) => options.onProgress?.(Math.min(99, Math.floor((done + read) / total * 100)), index, plain.size),
      })
      byDiffId.set(layer.digest, result)
      before += layer.size
    }
  } catch (error) {
    await release()
    if (options.signal?.aborted) throw error
    return null // quota, a missing API or a worker failure: send the layers as they are
  }
  return { byDiffId, release }
}
