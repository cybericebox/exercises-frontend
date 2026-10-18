import { gunzipSync } from "node:zlib"
import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { gunzipStream, gzipAndHash, through } from "./layerCompression"

/** Fixed bytes: a repeating pattern, so the test never depends on random data. */
const layer = Uint8Array.from({ length: 300_000 }, (_, i) => (i * 7 + (i >> 8)) & 0xff)

const stream = (bytes: Uint8Array, chunk = 64 * 1024) => new ReadableStream<Uint8Array>({
  start(controller) {
    for (let at = 0; at < bytes.length; at += chunk) controller.enqueue(bytes.subarray(at, at + chunk))
    controller.close()
  },
})

const join = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of parts) { out.set(part, at); at += part.length }
  return out
}
const sha = (bytes: Uint8Array) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`

describe("gzipAndHash", () => {
  it("writes a gzip of the layer and returns the digest and size of exactly those bytes", async () => {
    const written: Uint8Array[] = []
    const result = await gzipAndHash(stream(layer), (chunk) => { written.push(chunk.slice()) })
    const gz = join(written)
    expect(result.size).toBe(gz.length)
    expect(result.digest).toBe(sha(gz))
    expect(sha(gunzipSync(gz))).toBe(sha(layer)) // the diff id (digest of the uncompressed layer) is unchanged
    expect(gz.length).toBeLessThan(layer.length)
  })

  it("reports the uncompressed bytes read", async () => {
    const seen: number[] = []
    await gzipAndHash(stream(layer, 100_000), () => undefined, { onRead: (read) => seen.push(read) })
    expect(seen.at(-1)).toBe(layer.length)
    expect(seen).toEqual([...seen].sort((a, b) => a - b))
  })

  it("stops when the signal fires", async () => {
    const controller = new AbortController()
    controller.abort(new DOMException("x", "AbortError"))
    await expect(gzipAndHash(stream(layer), () => undefined, { signal: controller.signal })).rejects.toThrow()
  })
})

describe("gunzipStream", () => {
  it("writes the unpacked bytes", async () => {
    const written: Uint8Array[] = []
    const gz = new Uint8Array(await new Response(through(stream(layer), new CompressionStream("gzip"))).arrayBuffer())
    const size = await gunzipStream(stream(gz), (chunk) => { written.push(chunk.slice()) }, { maxBytes: 1_000_000 })
    expect(size).toBe(layer.length)
    expect(sha(join(written))).toBe(sha(layer))
  })

  it("refuses an archive that unpacks to more than the limit", async () => {
    const gz = new Uint8Array(await new Response(through(stream(layer), new CompressionStream("gzip"))).arrayBuffer())
    await expect(gunzipStream(stream(gz), () => undefined, { maxBytes: 1000 })).rejects.toMatchObject({ code: "tooLarge" })
  })
})
