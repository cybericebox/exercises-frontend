/**
 * layerCompression.worker.ts — runs the layer compression and the .tar.gz unpack off the main thread, writing to a
 * file of the browser's origin-private file system (OPFS) through a synchronous access handle (the only writer that
 * every browser with OPFS supports in a worker).
 *
 *   in:  {type:"compress", id, dir, name, blob}            → {type:"progress", id, read} …, {type:"done", id, digest, size}
 *        {type:"unpack", id, dir, name, blob, maxBytes}    → {type:"progress", id, read} …, {type:"done", id, size}
 *        {type:"abort", id}
 *   out: {type:"error", id, code} — code "aborted" | "tooLarge" | "quota" | "failed"
 */
import { gunzipStream, gzipAndHash } from "@/lib/layerCompression"
import { ImageArchiveError } from "@/lib/imageArchive"

type Request =
  | { type: "compress"; id: number; dir: string; name: string; blob: Blob }
  | { type: "unpack"; id: number; dir: string; name: string; blob: Blob; maxBytes: number }
  | { type: "abort"; id: number }

const scope = self as unknown as { postMessage(message: unknown): void; onmessage: ((event: MessageEvent<Request>) => void) | null }
const running = new Map<number, AbortController>()

/** The synchronous access handle API, which the DOM typings lack (workers only). */
type SyncAccessHandle = { write(data: Uint8Array, options: { at: number }): number; truncate(size: number): void; flush(): void; close(): void }
type SyncFileHandle = FileSystemFileHandle & { createSyncAccessHandle(): Promise<SyncAccessHandle> }

async function openSink(dir: string, name: string) {
  const root = await navigator.storage.getDirectory()
  const folder = await root.getDirectoryHandle(dir, { create: true })
  const handle = (await folder.getFileHandle(name, { create: true })) as SyncFileHandle
  const access = await handle.createSyncAccessHandle()
  access.truncate(0)
  let at = 0
  return {
    write(chunk: Uint8Array) {
      let done = 0
      while (done < chunk.length) {
        const wrote = access.write(chunk.subarray(done), { at: at + done })
        if (wrote <= 0) throw new DOMException("no space", "QuotaExceededError")
        done += wrote
      }
      at += chunk.length
    },
    close() {
      access.flush()
      access.close()
    },
  }
}

function codeOf(error: unknown): string {
  if (error instanceof ImageArchiveError) return error.code
  if (error instanceof DOMException && error.name === "AbortError") return "aborted"
  if (error instanceof DOMException && error.name === "QuotaExceededError") return "quota"
  return "failed"
}

async function run(request: Exclude<Request, { type: "abort" }>) {
  const controller = new AbortController()
  running.set(request.id, controller)
  let sink: Awaited<ReturnType<typeof openSink>> | null = null
  try {
    sink = await openSink(request.dir, request.name)
    const write = (chunk: Uint8Array) => sink?.write(chunk)
    const source = request.blob.stream() as ReadableStream<Uint8Array>
    if (request.type === "compress") {
      const result = await gzipAndHash(source, write, {
        signal: controller.signal,
        onRead: (read) => scope.postMessage({ type: "progress", id: request.id, read }),
      })
      sink.close()
      sink = null
      scope.postMessage({ type: "done", id: request.id, ...result })
    } else {
      const size = await gunzipStream(source, write, {
        maxBytes: request.maxBytes,
        signal: controller.signal,
        onBytes: (read) => scope.postMessage({ type: "progress", id: request.id, read }),
      })
      sink.close()
      sink = null
      scope.postMessage({ type: "done", id: request.id, size })
    }
  } catch (error) {
    try { sink?.close() } catch { /* the handle is already gone */ }
    scope.postMessage({ type: "error", id: request.id, code: codeOf(error) })
  } finally {
    running.delete(request.id)
  }
}

scope.onmessage = (event) => {
  const request = event.data
  if (request.type === "abort") running.get(request.id)?.abort(new DOMException("aborted", "AbortError"))
  else void run(request)
}
