import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ImageArchive } from "@/lib/imageArchive"

const apiPost = vi.fn()
const uploadInChunks = vi.fn()
const readImageArchive = vi.fn()

vi.mock("@/api/client", () => ({ apiPost: (...args: unknown[]) => apiPost(...args) }))
vi.mock("./chunkedUpload", () => ({ uploadInChunks: (...args: unknown[]) => uploadInChunks(...args) }))
vi.mock("@/lib/imageArchive", () => ({ readImageArchive: (...args: unknown[]) => readImageArchive(...args) }))

const { uploadImage } = await import("./images")

const EXERCISE = "11111111-2222-3333-4444-555555555555"
const HEX_CONFIG = "c".repeat(64)
const HEX_L1 = "1".repeat(64)
const HEX_L2 = "2".repeat(64)
const REFERENCE = `platform:app@sha256:${"f".repeat(64)}`
const LAYER_TAR = "application/vnd.oci.image.layer.v1.tar"
const OCI_CONFIG = "application/vnd.oci.image.config.v1+json"

// Bytes 0..99: the config at 10 (20 bytes), layer 1 at 30 (40 bytes), layer 2 at 70 (30 bytes).
const bytes = Uint8Array.from({ length: 100 }, (_, i) => i)
const file = new File([bytes], "image.tar")
const archive: ImageArchive = {
  config: { digest: `sha256:${HEX_CONFIG}`, mediaType: OCI_CONFIG, size: 20, offset: 10 },
  layers: [
    { digest: `sha256:${HEX_L1}`, mediaType: LAYER_TAR, size: 40, offset: 30 },
    { digest: `sha256:${HEX_L2}`, mediaType: LAYER_TAR, size: 30, offset: 70 },
    { digest: `sha256:${HEX_L1}`, mediaType: LAYER_TAR, size: 40, offset: 30 },
  ],
}

function answer(missing: string[]) {
  apiPost.mockImplementation(async (path: string) => {
    if (path.endsWith("/images/blobs/missing")) return { Missing: missing }
    if (path.endsWith("/images/blobs")) return {}
    if (path.endsWith("/images")) return { Reference: REFERENCE }
    throw new Error(path)
  })
}

beforeEach(() => {
  apiPost.mockReset()
  uploadInChunks.mockReset()
  readImageArchive.mockReset().mockResolvedValue(archive)
  uploadInChunks.mockImplementation(async (blob: File, onProgress?: (p: number) => void) => {
    onProgress?.(50)
    onProgress?.(100)
    return { FileID: `file-${blob.name}`, Name: blob.name, Size: blob.size }
  })
})

describe("uploadImage", () => {
  it("uploads only the blobs the registry lacks, pushes them, then creates the image", async () => {
    answer([`sha256:${HEX_L2}`])
    const reference = await uploadImage(EXERCISE, file, "app", vi.fn())
    expect(reference).toBe(REFERENCE)

    expect(apiPost.mock.calls[0]).toEqual([
      `/api/exercises/${EXERCISE}/images/blobs/missing`,
      { Digests: [`sha256:${HEX_CONFIG}`, `sha256:${HEX_L1}`, `sha256:${HEX_L2}`] },
      expect.anything(),
    ])

    expect(uploadInChunks).toHaveBeenCalledTimes(1)
    const [blob, , , options] = uploadInChunks.mock.calls[0] as [File, unknown, unknown, { purpose: string }]
    expect(blob.size).toBe(30)
    expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual(Array.from(bytes.slice(70, 100)))
    expect(blob.name).toBe(`sha256-${HEX_L2}`)
    expect(blob.lastModified).toBe(0)
    expect(options).toEqual({ purpose: "image-blob" })

    expect(apiPost.mock.calls[1]).toEqual([
      `/api/exercises/${EXERCISE}/images/blobs`,
      { FileID: `file-sha256-${HEX_L2}`, Digest: `sha256:${HEX_L2}`, Size: 30 },
      expect.anything(),
    ])
    expect(apiPost.mock.calls[2]).toEqual([
      `/api/exercises/${EXERCISE}/images`,
      {
        Name: "app",
        Config: { MediaType: OCI_CONFIG, Digest: `sha256:${HEX_CONFIG}`, Size: 20 },
        Layers: [
          { MediaType: LAYER_TAR, Digest: `sha256:${HEX_L1}`, Size: 40 },
          { MediaType: LAYER_TAR, Digest: `sha256:${HEX_L2}`, Size: 30 },
          { MediaType: LAYER_TAR, Digest: `sha256:${HEX_L1}`, Size: 40 },
        ],
      },
      expect.anything(),
    ])
    expect(apiPost).toHaveBeenCalledTimes(3)
  })

  it("counts progress over the missing bytes only, reaching 100 after the image is created", async () => {
    answer([`sha256:${HEX_CONFIG}`, `sha256:${HEX_L1}`])
    const progress = vi.fn()
    await uploadImage(EXERCISE, file, "app", progress)
    // Missing: config 20 + layer 1 40 = 60 bytes. Half of the config = 10/60, all of it = 20/60, …
    expect(progress.mock.calls.map((c) => c[0])).toEqual([0, 16, 33, 66, 99, 100])
  })

  it("creates the image straight away when the registry has every blob", async () => {
    answer([])
    const progress = vi.fn()
    await expect(uploadImage(EXERCISE, file, "app", progress)).resolves.toBe(REFERENCE)
    expect(uploadInChunks).not.toHaveBeenCalled()
    expect(apiPost).toHaveBeenCalledTimes(2)
    expect(progress).toHaveBeenLastCalledWith(100)
  })

  it("stops on abort: no further blob and no image", async () => {
    answer([`sha256:${HEX_L1}`, `sha256:${HEX_L2}`])
    const controller = new AbortController()
    uploadInChunks.mockImplementation(async (blob: File, _p: unknown, signal: AbortSignal) => {
      expect(signal).toBe(controller.signal)
      controller.abort()
      return { FileID: "x", Name: blob.name, Size: blob.size }
    })
    await expect(uploadImage(EXERCISE, file, "app", undefined, controller.signal)).rejects.toMatchObject({ name: "AbortError" })
    expect(uploadInChunks).toHaveBeenCalledTimes(1)
    expect(apiPost.mock.calls.some(([path]) => String(path).endsWith("/images"))).toBe(false)
  })

  it("passes archive errors through without calling the API", async () => {
    readImageArchive.mockRejectedValue(Object.assign(new Error("gzip"), { code: "gzip" }))
    await expect(uploadImage(EXERCISE, file, "app")).rejects.toMatchObject({ code: "gzip" })
    expect(apiPost).not.toHaveBeenCalled()
  })
})
