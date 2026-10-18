import { createHash } from "node:crypto"
import { gunzipSync, gzipSync } from "node:zlib"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ImageArchive } from "@/lib/imageArchive"

const readImageArchive = vi.fn()
vi.mock("@/lib/imageArchive", async (original) => ({
  ...(await original<typeof import("@/lib/imageArchive")>()),
  readImageArchive: (...args: unknown[]) => readImageArchive(...args),
}))

const { compressLayers, prepareImage } = await import("./imageCompression")
const { gzipAndHash, gunzipStream } = await import("./layerCompression")
type Engine = import("./imageCompression").CompressionEngine

const PLAIN = "application/vnd.oci.image.layer.v1.tar"
const sha = (bytes: Uint8Array) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`
/** A fixed layer: no random bytes. */
const layerBytes = Uint8Array.from({ length: 40_000 }, (_, i) => (i * 13 + (i >> 5)) & 0xff)
const DIFF = sha(layerBytes)

/** An in-memory engine that really gzips and unpacks, so the digests are the real ones. */
function memoryEngine(overrides: Partial<Engine> = {}): Engine & { stored: Map<string, File>; removed: string[] } {
  const stored = new Map<string, File>()
  const removed: string[] = []
  let count = 0
  return {
    stored,
    removed,
    freeBytes: async () => 10 ** 9,
    purgeStale: async () => undefined,
    async compress(blob, options) {
      const parts: Uint8Array[] = []
      const { digest, size } = await gzipAndHash(await bytesStream(blob), (chunk) => { parts.push(chunk.slice()) }, options)
      const tempName = `tmp-${++count}.gz`
      const file = new File(parts as BlobPart[], `sha256-${digest.slice(7)}`, { lastModified: 0 })
      stored.set(tempName, file)
      return { digest, size, tempName, file }
    },
    async unpack(file, options) {
      const parts: Uint8Array[] = []
      await gunzipStream(await bytesStream(file), (chunk) => { parts.push(chunk.slice()) }, options)
      const tempName = `tmp-${++count}.tar`
      const tar = new File(parts as BlobPart[], "unpacked.tar")
      stored.set(tempName, tar)
      return { file: tar, tempName }
    },
    async remove(names) { removed.push(...names) },
    ...overrides,
  }
}

const archive = (mediaTypes: string[] = [PLAIN]): ImageArchive => ({
  config: { digest: `sha256:${"c".repeat(64)}`, mediaType: "application/vnd.oci.image.config.v1+json", size: 10, offset: 0 },
  layers: mediaTypes.map((mediaType, i) => ({ digest: i === 0 ? DIFF : `sha256:${String(i).repeat(64)}`, mediaType, size: layerBytes.length, offset: i * layerBytes.length })),
})

const tarFile = () => new File([layerBytes, layerBytes], "image.tar")
const gz = async (bytes: Uint8Array) => new File([new Uint8Array(gzipSync(bytes))], "image.tar.gz")

/** jsdom's Blob has no stream(): read the bytes and stream those. */
async function bytesStream(blob: Blob): Promise<ReadableStream<Uint8Array>> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close() } })
}

beforeEach(() => { readImageArchive.mockReset().mockImplementation(async () => archive()) })

describe("compressLayers", () => {
  it("gzips each layer: the digest is that of the gzip bytes, the diff id (uncompressed digest) is the key", async () => {
    const engine = memoryEngine()
    const result = await compressLayers(tarFile(), archive(), { engine })
    const compressed = result?.byDiffId.get(DIFF)
    expect(compressed).toBeDefined()
    const bytes = new Uint8Array(await compressed!.file.arrayBuffer())
    expect(compressed!.digest).toBe(sha(bytes))
    expect(compressed!.size).toBe(bytes.length)
    expect(sha(gunzipSync(bytes))).toBe(DIFF)
    expect(compressed!.file.name).toBe(`sha256-${compressed!.digest.slice(7)}`)
    expect(compressed!.file.lastModified).toBe(0)
  })

  it("compresses a layer that repeats once, and leaves layers that are not plain tar alone", async () => {
    const engine = memoryEngine()
    const twice: ImageArchive = { ...archive(), layers: [archive().layers[0], archive().layers[0], { ...archive().layers[0], digest: `sha256:${"9".repeat(64)}`, mediaType: "application/vnd.oci.image.layer.v1.tar+gzip" }] }
    const result = await compressLayers(tarFile(), twice, { engine })
    expect([...result!.byDiffId.keys()]).toEqual([DIFF])
  })

  it("reports the percent of layer bytes and the layer in work", async () => {
    const seen: Array<[number, number, number]> = []
    await compressLayers(tarFile(), archive([PLAIN, PLAIN]), { engine: memoryEngine(), onProgress: (percent, layer, layers) => seen.push([percent, layer, layers]) })
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every(([, , layers]) => layers === 2)).toBe(true)
    expect(seen.at(-1)?.[1]).toBe(2)
    expect(Math.max(...seen.map(([percent]) => percent))).toBeLessThanOrEqual(99)
  })

  it("returns null (send the layers as they are) with no engine, no room, or a failing worker", async () => {
    expect(await compressLayers(tarFile(), archive(), { engine: null })).toBeNull()
    expect(await compressLayers(tarFile(), archive(), { engine: memoryEngine({ freeBytes: async () => layerBytes.length - 1 }) })).toBeNull()
    const failing = memoryEngine({ compress: async () => { throw new DOMException("full", "QuotaExceededError") } })
    expect(await compressLayers(tarFile(), archive(), { engine: failing })).toBeNull()
  })

  it("tries to compress when the browser does not report the quota", async () => {
    const result = await compressLayers(tarFile(), archive(), { engine: memoryEngine({ freeBytes: async () => null }) })
    expect(result?.byDiffId.size).toBe(1)
  })

  it("removes the temporary files of the layers already done when a later one fails", async () => {
    const engine = memoryEngine()
    const inner = engine.compress.bind(engine)
    let calls = 0
    engine.compress = async (blob, options) => {
      if (++calls === 2) throw new Error("boom")
      return inner(blob, options)
    }
    expect(await compressLayers(tarFile(), archive([PLAIN, PLAIN]), { engine })).toBeNull()
    expect(engine.removed).toEqual(["tmp-1.gz"])
  })

  it("passes an abort through", async () => {
    const controller = new AbortController()
    controller.abort(new DOMException("stop", "AbortError"))
    await expect(compressLayers(tarFile(), archive(), { engine: memoryEngine(), signal: controller.signal })).rejects.toThrow()
  })

  it("release removes the temporary files", async () => {
    const engine = memoryEngine()
    const result = await compressLayers(tarFile(), archive(), { engine })
    await result!.release()
    expect(engine.removed).toEqual(["tmp-1.gz"])
  })
})

describe("prepareImage", () => {
  it("reads a .tar as it is", async () => {
    const file = tarFile()
    const prepared = await prepareImage(file, { engine: memoryEngine() })
    expect(prepared.source).toBe(file)
    expect(readImageArchive).toHaveBeenCalledWith(file)
  })

  it("unpacks a .tar.gz first and reads the unpacked tar", async () => {
    const engine = memoryEngine()
    const prepared = await prepareImage(await gz(layerBytes), { engine })
    expect(prepared.source.size).toBe(layerBytes.length)
    expect(readImageArchive).toHaveBeenCalledWith(prepared.source)
    await prepared.release()
    expect(engine.removed).toEqual(["tmp-1.tar"])
  })

  it("removes the unpacked file when the archive turns out to be unusable", async () => {
    const engine = memoryEngine()
    readImageArchive.mockRejectedValue(new Error("not an image"))
    await expect(prepareImage(await gz(layerBytes), { engine })).rejects.toThrow("not an image")
    expect(engine.removed).toEqual(["tmp-1.tar"])
  })

  it("refuses a .tar.gz in a browser that cannot unpack it", async () => {
    await expect(prepareImage(await gz(layerBytes), { engine: null })).rejects.toMatchObject({ code: "gzip" })
  })

  it("refuses a .tar.gz when there is no room to unpack it (checked before writing)", async () => {
    const engine = memoryEngine({ freeBytes: async () => 10 })
    const unpack = vi.spyOn(engine, "unpack")
    await expect(prepareImage(await gz(layerBytes), { engine })).rejects.toMatchObject({ code: "noSpace" })
    expect(unpack).not.toHaveBeenCalled()
  })

  it("maps a full disk during the unpack to noSpace", async () => {
    const engine = memoryEngine({ unpack: async () => { throw new DOMException("full", "QuotaExceededError") } })
    await expect(prepareImage(await gz(layerBytes), { engine })).rejects.toMatchObject({ code: "noSpace" })
  })
})
