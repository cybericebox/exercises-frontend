/**
 * layerCompression.ts — the streaming core of the layer compression, free of any browser storage so it runs (and is
 * tested) anywhere: gzip a layer while hashing the compressed bytes, and unpack a gzip.
 *
 * The registry digest of a compressed layer is the sha256 of the gzip bytes, known only once the layer is whole, so
 * the hash is incremental (Web Crypto digest is not). The uncompressed digest (diff id) is in the image config and
 * does not change.
 */
import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex } from "@noble/hashes/utils.js"
import { ImageArchiveError } from "@/lib/imageArchive"

type Transform = { readable: ReadableStream<Uint8Array>; writable: WritableStream<never> }

/** pipeThrough for the built-in (De)CompressionStream, whose writable side is typed for BufferSource. */
export function through(source: ReadableStream<Uint8Array>, transform: Transform | CompressionStream | DecompressionStream): ReadableStream<Uint8Array> {
  return source.pipeThrough(transform as unknown as ReadableWritablePair<Uint8Array, Uint8Array>)
}

type Write = (chunk: Uint8Array) => void | Promise<void>

/** Reads a stream chunk by chunk; stops with the abort reason as soon as the signal fires. */
async function drain(stream: ReadableStream<Uint8Array>, each: (chunk: Uint8Array) => void | Promise<void>, signal?: AbortSignal): Promise<void> {
  const reader = stream.getReader()
  try {
    for (;;) {
      signal?.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) return
      await each(value)
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
}

/**
 * Gzips `source`, passing every compressed chunk to `write`; resolves with the digest ("sha256:<hex>") and size of the
 * compressed bytes. `onRead` gets the uncompressed bytes taken so far.
 */
export async function gzipAndHash(
  source: ReadableStream<Uint8Array>,
  write: Write,
  options: { signal?: AbortSignal; onRead?: (read: number) => void } = {},
): Promise<{ digest: string; size: number }> {
  const { signal, onRead } = options
  let read = 0
  const counted = source.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      read += chunk.length
      onRead?.(read)
      controller.enqueue(chunk)
    },
  }))
  const hash = sha256.create()
  let size = 0
  await drain(through(counted, new CompressionStream("gzip")), async (chunk) => {
    hash.update(chunk)
    size += chunk.length
    await write(chunk)
  }, signal)
  return { digest: `sha256:${bytesToHex(hash.digest())}`, size }
}

/** Unpacks a gzip stream into `write`; resolves with the unpacked size. More than `maxBytes` is "tooLarge". */
export async function gunzipStream(
  source: ReadableStream<Uint8Array>,
  write: Write,
  options: { maxBytes: number; signal?: AbortSignal; onBytes?: (written: number) => void },
): Promise<number> {
  let size = 0
  await drain(through(source, new DecompressionStream("gzip")), async (chunk) => {
    size += chunk.length
    if (size > options.maxBytes) throw new ImageArchiveError("tooLarge")
    await write(chunk)
    options.onBytes?.(size)
  }, options.signal)
  return size
}
