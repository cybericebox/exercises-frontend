/**
 * images.ts — uploads a `docker save` archive to the platform image registry.
 *
 *   POST /api/exercises/:id/images/blobs/missing   {Digests}                 → {Missing}: blobs the registry lacks
 *   (chunked upload of each missing blob, purpose "image-blob")
 *   POST /api/exercises/:id/images/blobs           {FileID, Digest, Size}    pushes the staged blob to the registry
 *   POST /api/exercises/:id/images                 {Name, Config, Layers}    → {Reference}: platform:<name>@sha256:<hex>
 *
 * Only the blobs the registry lacks travel; each blob is a slice of the archive with a stable name, so an
 * interrupted upload resumes after a reload.
 */
import { apiPost } from "@/api/client"
import { uploadInChunks } from "./chunkedUpload"
import { type BlobEntry, readImageArchive } from "@/lib/imageArchive"

const BASE = "/api/exercises"

/** The media upload purpose that lets a staged file be as large as an image archive. */
export const IMAGE_BLOB_PURPOSE = "image-blob"

type Descriptor = { MediaType: string; Digest: string; Size: number }

const descriptor = (blob: BlobEntry): Descriptor => ({ MediaType: blob.mediaType, Digest: blob.digest, Size: blob.size })

/** A blob of the archive as a file: the name and lastModified stay the same across reloads, so the upload resumes. */
function blobFile(file: File, blob: BlobEntry): File {
  return new File([file.slice(blob.offset, blob.offset + blob.size)], `sha256-${blob.digest.slice("sha256:".length)}`, {
    type: "application/octet-stream",
    lastModified: 0,
  })
}

/**
 * Uploads the image in the archive and resolves with its platform reference. Progress is 0–100 over the bytes
 * that actually travel (blobs the registry already has do not count) and reaches 100 once the image exists.
 * Throws ImageArchiveError for an archive that cannot be used.
 */
export async function uploadImage(
  exerciseID: string,
  file: File,
  name: string,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  const base = `${BASE}/${exerciseID}/images`
  const init = { signal }
  let last = -1
  const report = (percent: number) => {
    if (percent === last) return
    last = percent
    onProgress?.(percent)
  }

  const archive = await readImageArchive(file)
  signal?.throwIfAborted()
  const unique = new Map<string, BlobEntry>()
  for (const blob of [archive.config, ...archive.layers]) if (!unique.has(blob.digest)) unique.set(blob.digest, blob)

  const answer = await apiPost<{ Missing: string[] | null }>(`${base}/blobs/missing`, { Digests: [...unique.keys()] }, init)
  const missing = new Set(answer.Missing ?? [])
  const toSend = [...unique.values()].filter((blob) => missing.has(blob.digest))
  const total = toSend.reduce((sum, blob) => sum + blob.size, 0)
  const bytes = (sent: number) => report(total === 0 ? 99 : Math.min(99, Math.floor(sent / total * 100)))

  report(0)
  let done = 0
  for (const blob of toSend) {
    signal?.throwIfAborted()
    const stored = await uploadInChunks(
      blobFile(file, blob),
      (percent) => bytes(done + blob.size * percent / 100),
      signal,
      { purpose: IMAGE_BLOB_PURPOSE },
    )
    signal?.throwIfAborted()
    await apiPost(`${base}/blobs`, { FileID: stored.FileID, Digest: blob.digest, Size: blob.size }, init)
    done += blob.size
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
