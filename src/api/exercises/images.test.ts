import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ImageArchive } from "@/lib/imageArchive"

const apiPost = vi.fn()
const apiGet = vi.fn()
const uploadChunks = vi.fn()
const forgetChunkedUpload = vi.fn()
const readImageArchive = vi.fn()

vi.mock("@/api/client", async (original) => ({
  ...(await original<typeof import("@/api/client")>()),
  apiPost: (...args: unknown[]) => apiPost(...args),
  apiGet: (...args: unknown[]) => apiGet(...args),
}))
vi.mock("./chunkedUpload", () => ({
  uploadChunks: (...args: unknown[]) => uploadChunks(...args),
  forgetChunkedUpload: (...args: unknown[]) => forgetChunkedUpload(...args),
}))
vi.mock("@/lib/imageArchive", () => ({ readImageArchive: (...args: unknown[]) => readImageArchive(...args) }))
const compressLayers = vi.fn()
const release = vi.fn()
vi.mock("@/lib/imageCompression", () => ({
  GZIP_LAYER: "application/vnd.oci.image.layer.v1.tar+gzip",
  prepareImage: async (file: File) => ({ archive: await readImageArchive(file), source: file, release }),
  compressLayers: (...args: unknown[]) => compressLayers(...args),
}))

const { ApiError } = await import("@/api/client")
const { BLOB_POLL_MS, BLOB_PUSH_MAX_WAIT_MS, ImagePushError, uploadImage } = await import("./images")

const EXERCISE = "11111111-2222-3333-4444-555555555555"
const HEX_CONFIG = "c".repeat(64)
const HEX_L1 = "1".repeat(64)
const HEX_L2 = "2".repeat(64)
const CONFIG = `sha256:${HEX_CONFIG}`
const L1 = `sha256:${HEX_L1}`
const L2 = `sha256:${HEX_L2}`
const REFERENCE = `platform:app@sha256:${"f".repeat(64)}`
const LAYER_TAR = "application/vnd.oci.image.layer.v1.tar"
const OCI_CONFIG = "application/vnd.oci.image.config.v1+json"
const BASE = `/api/exercises/${EXERCISE}/images`

// Bytes 0..99: the config at 10 (20 bytes), layer 1 at 30 (40 bytes), layer 2 at 70 (30 bytes).
const bytes = Uint8Array.from({ length: 100 }, (_, i) => i)
const file = new File([bytes], "image.tar")
const archive: ImageArchive = {
  config: { digest: CONFIG, mediaType: OCI_CONFIG, size: 20, offset: 10 },
  layers: [
    { digest: L1, mediaType: LAYER_TAR, size: 40, offset: 30 },
    { digest: L2, mediaType: LAYER_TAR, size: 30, offset: 70 },
    { digest: L1, mediaType: LAYER_TAR, size: 40, offset: 30 },
  ],
}

const uploadIdOf = (blob: File) => `upload-${blob.name}`
const uploadId = (digest: string) => `upload-sha256-${digest.slice("sha256:".length)}`

type BlobScript = { push?: Array<"present" | "pushing" | Error>; status?: Array<{ State: string; Reason?: string } | Error> }

/** Answers the image API: the missing list, the blob pushes and the status polls follow the scripts per digest, in order. */
function serve(missing: string[], scripts: Record<string, BlobScript> = {}) {
  const pushes: Record<string, number> = {}
  const polls: Record<string, number> = {}
  apiPost.mockImplementation(async (path: string, body: { Digest?: string }) => {
    if (path === `${BASE}/blobs/missing`) return { Missing: missing }
    if (path === `${BASE}/blobs`) {
      const digest = body.Digest ?? ""
      const script = scripts[digest]?.push ?? ["present"]
      const answer = script[Math.min(pushes[digest] = (pushes[digest] ?? -1) + 1, script.length - 1)]
      if (answer instanceof Error) throw answer
      return { State: answer }
    }
    if (path === BASE) return { Reference: REFERENCE }
    throw new Error(path)
  })
  apiGet.mockImplementation(async (path: string) => {
    const digest = decodeURIComponent(path.slice(`${BASE}/blobs/`.length))
    const script = scripts[digest]?.status ?? [{ State: "present" }]
    const answer = script[Math.min(polls[digest] = (polls[digest] ?? -1) + 1, script.length - 1)]
    if (answer instanceof Error) throw answer
    return answer
  })
}

const posts = (path: string) => apiPost.mock.calls.filter(([p]) => p === path)

beforeEach(() => {
  apiPost.mockReset()
  apiGet.mockReset()
  uploadChunks.mockReset()
  forgetChunkedUpload.mockReset()
  readImageArchive.mockReset().mockResolvedValue(archive)
  compressLayers.mockReset().mockResolvedValue(null)
  release.mockReset().mockResolvedValue(undefined)
  uploadChunks.mockImplementation(async (blob: File, onProgress?: (p: number) => void) => {
    onProgress?.(50)
    onProgress?.(100)
    return uploadIdOf(blob)
  })
})

afterEach(() => { vi.useRealTimers() })

describe("uploadImage", () => {
  it("uploads only the blobs the registry lacks without completing them, pushes them, then creates the image", async () => {
    serve([L2])
    const reference = await uploadImage(EXERCISE, file, "app", vi.fn())
    expect(reference).toBe(REFERENCE)

    expect(apiPost.mock.calls[0]).toEqual([`${BASE}/blobs/missing`, { Digests: [CONFIG, L1, L2] }, expect.anything()])

    expect(uploadChunks).toHaveBeenCalledTimes(1)
    const [blob, , , options] = uploadChunks.mock.calls[0] as [File, unknown, unknown, { purpose: string }]
    expect(blob.size).toBe(30)
    expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual(Array.from(bytes.slice(70, 100)))
    expect(blob.name).toBe(`sha256-${HEX_L2}`)
    expect(blob.lastModified).toBe(0)
    expect(options).toEqual({ purpose: "image-blob" })

    expect(apiPost.mock.calls[1]).toEqual([`${BASE}/blobs`, { UploadID: uploadId(L2), Digest: L2, Size: 30 }, expect.anything()])
    expect(apiPost.mock.calls[2]).toEqual([
      BASE,
      {
        Name: "app",
        Config: { MediaType: OCI_CONFIG, Digest: CONFIG, Size: 20 },
        Layers: [
          { MediaType: LAYER_TAR, Digest: L1, Size: 40 },
          { MediaType: LAYER_TAR, Digest: L2, Size: 30 },
          { MediaType: LAYER_TAR, Digest: L1, Size: 40 },
        ],
      },
      expect.anything(),
    ])
    expect(apiPost).toHaveBeenCalledTimes(3)
    expect(apiGet).not.toHaveBeenCalled()
    // The registry has the blob: the browser forgets its upload.
    expect(forgetChunkedUpload).toHaveBeenCalledTimes(1)
    expect((forgetChunkedUpload.mock.calls[0][0] as File).name).toBe(`sha256-${HEX_L2}`)
  })

  it("counts progress over the missing bytes only, reaching 100 after the image is created", async () => {
    serve([CONFIG, L1])
    const progress = vi.fn()
    await uploadImage(EXERCISE, file, "app", progress)
    // Missing: config 20 + layer 1 40 = 60 bytes. Half of the config = 10/60, all of it = 20/60, …
    expect(progress.mock.calls.map((c) => c[0])).toEqual([0, 16, 33, 66, 99, 100])
    expect(progress.mock.calls.every((c) => c[1] === "uploading")).toBe(true)
  })

  it("creates the image straight away when the registry has every blob", async () => {
    serve([])
    const progress = vi.fn()
    await expect(uploadImage(EXERCISE, file, "app", progress)).resolves.toBe(REFERENCE)
    expect(uploadChunks).not.toHaveBeenCalled()
    expect(apiPost).toHaveBeenCalledTimes(2)
    expect(progress).toHaveBeenLastCalledWith(100, "uploading")
  })

  it("waits for a background push: polls the blob every few seconds, then creates the image", async () => {
    vi.useFakeTimers()
    serve([L1, L2], {
      [L1]: { push: ["pushing"], status: [{ State: "pushing" }, { State: "present" }] },
      [L2]: { push: ["present"] },
    })
    const progress = vi.fn()
    const promise = uploadImage(EXERCISE, file, "app", progress)
    await vi.advanceTimersByTimeAsync(0)
    expect(posts(BASE)).toHaveLength(0)
    expect(progress).toHaveBeenLastCalledWith(99, "pushing")
    expect(apiGet).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(BLOB_POLL_MS)
    expect(apiGet).toHaveBeenCalledTimes(1)
    expect(apiGet.mock.calls[0][0]).toBe(`${BASE}/blobs/${encodeURIComponent(L1)}`)
    expect(posts(BASE)).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(BLOB_POLL_MS)
    await expect(promise).resolves.toBe(REFERENCE)
    expect(apiGet).toHaveBeenCalledTimes(2)
    expect(posts(BASE)).toHaveLength(1)
    expect(progress).toHaveBeenLastCalledWith(100, "pushing")
    expect(forgetChunkedUpload).toHaveBeenCalledTimes(2)
  })

  it("uploads a blob again once when the push finds it does not match its digest", async () => {
    vi.useFakeTimers()
    serve([L2], { [L2]: { push: ["pushing", "present"], status: [{ State: "failed", Reason: "digest_mismatch" }] } })
    const promise = uploadImage(EXERCISE, file, "app")
    await vi.advanceTimersByTimeAsync(BLOB_POLL_MS)
    await expect(promise).resolves.toBe(REFERENCE)
    expect(uploadChunks).toHaveBeenCalledTimes(2)
    expect(posts(`${BASE}/blobs`)).toHaveLength(2)
    // The mismatched upload is forgotten before it is sent again, so a new upload starts.
    expect(forgetChunkedUpload.mock.invocationCallOrder[0]).toBeLessThan(uploadChunks.mock.invocationCallOrder[1])
  })

  it("a re-upload shows byte progress again, then goes back to the push stage", async () => {
    vi.useFakeTimers()
    serve([L2], { [L2]: { push: ["pushing", "pushing"], status: [{ State: "failed", Reason: "digest_mismatch" }, { State: "present" }] } })
    const progress = vi.fn()
    const promise = uploadImage(EXERCISE, file, "app", progress)
    await vi.advanceTimersByTimeAsync(BLOB_POLL_MS * 2)
    await expect(promise).resolves.toBe(REFERENCE)
    const calls = progress.mock.calls.map(([percent, stage]) => `${percent}:${stage}`)
    const firstPush = calls.indexOf("99:pushing")
    expect(calls.slice(firstPush + 1)).toEqual(["0:uploading", "50:uploading", "99:uploading", "99:pushing", "100:pushing"])
  })

  it("a retry of the push whose upload expired uploads the blob again", async () => {
    vi.useFakeTimers()
    serve([L2], {
      [L2]: {
        push: ["pushing", new ApiError(404, null, "x", undefined, 32818), "present"],
        status: [{ State: "failed", Reason: "unreachable" }],
      },
    })
    const promise = uploadImage(EXERCISE, file, "app")
    await vi.advanceTimersByTimeAsync(BLOB_POLL_MS)
    await expect(promise).resolves.toBe(REFERENCE)
    expect(uploadChunks).toHaveBeenCalledTimes(2)
    expect(posts(`${BASE}/blobs`)).toHaveLength(3)
  })

  it("stops after a second digest mismatch, with no image", async () => {
    vi.useFakeTimers()
    serve([L2], { [L2]: { push: ["pushing"], status: [{ State: "failed", Reason: "digest_mismatch" }] } })
    const settled = uploadImage(EXERCISE, file, "app").catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(BLOB_POLL_MS * 2)
    const error = await settled
    expect(error).toBeInstanceOf(ImagePushError)
    expect((error as InstanceType<typeof ImagePushError>).reason).toBe("digest_mismatch")
    expect(uploadChunks).toHaveBeenCalledTimes(2)
    expect(posts(BASE)).toHaveLength(0)
  })

  it("asks again with the same upload after a registry hiccup", async () => {
    vi.useFakeTimers()
    serve([L2], { [L2]: { push: ["pushing", "pushing"], status: [{ State: "failed", Reason: "unreachable" }, { State: "present" }] } })
    const promise = uploadImage(EXERCISE, file, "app")
    await vi.advanceTimersByTimeAsync(BLOB_POLL_MS * 2)
    await expect(promise).resolves.toBe(REFERENCE)
    expect(uploadChunks).toHaveBeenCalledTimes(1)
    expect(posts(`${BASE}/blobs`).map(([, body]) => body)).toEqual([
      { UploadID: uploadId(L2), Digest: L2, Size: 30 },
      { UploadID: uploadId(L2), Digest: L2, Size: 30 },
    ])
  })

  it("stops with the reason when the registry refuses the push", async () => {
    vi.useFakeTimers()
    serve([L2], { [L2]: { push: ["pushing"], status: [{ State: "failed", Reason: "unauthorized" }] } })
    const settled = uploadImage(EXERCISE, file, "app").catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(BLOB_POLL_MS)
    const error = await settled
    expect(error).toBeInstanceOf(ImagePushError)
    expect((error as InstanceType<typeof ImagePushError>).reason).toBe("unauthorized")
    expect(posts(`${BASE}/blobs`)).toHaveLength(1)
    expect(posts(BASE)).toHaveLength(0)
    // The upload stays known: a later try re-uses it.
    expect(forgetChunkedUpload).not.toHaveBeenCalled()
  })

  it("gives up after the overall wait", async () => {
    vi.useFakeTimers()
    serve([L2], { [L2]: { push: ["pushing"], status: [{ State: "pushing" }] } })
    const settled = uploadImage(EXERCISE, file, "app").catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(BLOB_PUSH_MAX_WAIT_MS + BLOB_POLL_MS * 2)
    const error = await settled
    expect((error as InstanceType<typeof ImagePushError>).reason).toBe("timeout")
    expect(posts(BASE)).toHaveLength(0)
  })

  it("keeps polling through a failed status request", async () => {
    vi.useFakeTimers()
    serve([L2], { [L2]: { push: ["pushing"], status: [new ApiError(0, null, "Failed to fetch"), { State: "present" }] } })
    const promise = uploadImage(EXERCISE, file, "app")
    await vi.advanceTimersByTimeAsync(BLOB_POLL_MS * 2)
    await expect(promise).resolves.toBe(REFERENCE)
  })

  it("a status poll it retries on its own does not report a platform outage", async () => {
    vi.useFakeTimers()
    serve([L2], { [L2]: { push: ["pushing"], status: [{ State: "present" }] } })
    const promise = uploadImage(EXERCISE, file, "app")
    await vi.advanceTimersByTimeAsync(BLOB_POLL_MS)
    await expect(promise).resolves.toBe(REFERENCE)
    expect(apiGet.mock.calls[0][2]).toEqual({ silentOutage: true, retry: false })
  })

  it("uploads again once when the server lost the staged upload", async () => {
    serve([L2], { [L2]: { push: [new ApiError(404, null, "x", undefined, 32818), "present"] } })
    await expect(uploadImage(EXERCISE, file, "app")).resolves.toBe(REFERENCE)
    expect(forgetChunkedUpload).toHaveBeenCalled()
    expect(uploadChunks).toHaveBeenCalledTimes(2)
  })

  it("stops on abort while waiting for a push: no image", async () => {
    vi.useFakeTimers()
    serve([L2], { [L2]: { push: ["pushing"], status: [{ State: "pushing" }] } })
    const controller = new AbortController()
    const settled = uploadImage(EXERCISE, file, "app", undefined, controller.signal).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(BLOB_POLL_MS)
    controller.abort()
    await vi.advanceTimersByTimeAsync(0)
    expect(await settled).toMatchObject({ name: "AbortError" })
    await vi.advanceTimersByTimeAsync(BLOB_POLL_MS * 3)
    expect(apiGet).toHaveBeenCalledTimes(1)
    expect(posts(BASE)).toHaveLength(0)
  })

  it("stops on abort between blobs: no further blob and no image", async () => {
    serve([L1, L2])
    const controller = new AbortController()
    uploadChunks.mockImplementation(async (blob: File, _p: unknown, signal: AbortSignal) => {
      expect(signal).toBe(controller.signal)
      controller.abort()
      return uploadIdOf(blob)
    })
    await expect(uploadImage(EXERCISE, file, "app", undefined, controller.signal)).rejects.toMatchObject({ name: "AbortError" })
    expect(uploadChunks).toHaveBeenCalledTimes(1)
    expect(posts(BASE)).toHaveLength(0)
  })

  it("passes archive errors through without calling the API", async () => {
    readImageArchive.mockRejectedValue(Object.assign(new Error("gzip"), { code: "gzip" }))
    await expect(uploadImage(EXERCISE, file, "app")).rejects.toMatchObject({ code: "gzip" })
    expect(apiPost).not.toHaveBeenCalled()
  })
})

describe("uploadImage with compressed layers", () => {
  const GZ = "application/vnd.oci.image.layer.v1.tar+gzip"
  const Z1 = `sha256:${"a".repeat(64)}`
  const Z2 = `sha256:${"b".repeat(64)}`
  const packed = (digest: string, size: number, content: number) => ({
    digest,
    size,
    tempName: `tmp-${content}.gz`,
    file: new File([Uint8Array.from({ length: size }, () => content)], `sha256-${digest.slice(7)}`, { lastModified: 0 }),
  })

  beforeEach(() => {
    compressLayers.mockResolvedValue({
      byDiffId: new Map([[L1, packed(Z1, 12, 1)], [L2, packed(Z2, 9, 2)]]),
      release,
    })
  })

  it("asks for, uploads and describes the compressed layers; the config stays as it is", async () => {
    serve([CONFIG, Z1, Z2])
    await uploadImage(EXERCISE, file, "app", vi.fn())

    expect(apiPost.mock.calls[0]).toEqual([`${BASE}/blobs/missing`, { Digests: [CONFIG, Z1, Z2] }, expect.anything()])
    const sent = uploadChunks.mock.calls.map(([blob]) => blob as File)
    expect(sent.map((blob) => [blob.name, blob.size])).toEqual([[`sha256-${HEX_CONFIG}`, 20], [`sha256-${"a".repeat(64)}`, 12], [`sha256-${"b".repeat(64)}`, 9]])
    expect(apiPost.mock.calls.at(-1)).toEqual([
      BASE,
      {
        Name: "app",
        Config: { MediaType: OCI_CONFIG, Digest: CONFIG, Size: 20 },
        Layers: [
          { MediaType: GZ, Digest: Z1, Size: 12 },
          { MediaType: GZ, Digest: Z2, Size: 9 },
          { MediaType: GZ, Digest: Z1, Size: 12 },
        ],
      },
      expect.anything(),
    ])
  })

  it("counts progress over the compressed bytes and reports them with the size they were", async () => {
    serve([Z1, Z2])
    const progress = vi.fn()
    await uploadImage(EXERCISE, file, "app", progress)
    const detail = progress.mock.calls.map((call) => call[2]).filter(Boolean)
    expect(detail.at(-1)).toMatchObject({ total: 21, sent: 21, original: 110 })
  })

  it("removes the temporary files when the upload ends, and when it fails", async () => {
    serve([Z1])
    await uploadImage(EXERCISE, file, "app", vi.fn())
    expect(release).toHaveBeenCalledTimes(2) // the compressed layers and the prepared archive

    release.mockClear()
    apiPost.mockRejectedValue(new Error("boom"))
    await expect(uploadImage(EXERCISE, file, "app", vi.fn())).rejects.toThrow("boom")
    expect(release).toHaveBeenCalledTimes(2)
  })

  it("reports the compression stage with the layer in work", async () => {
    compressLayers.mockImplementation(async (_source: unknown, _archive: unknown, options: { onProgress: (p: number, l: number, n: number) => void }) => {
      options.onProgress(40, 2, 3)
      return null
    })
    serve([])
    const progress = vi.fn()
    await uploadImage(EXERCISE, file, "app", progress)
    expect(progress).toHaveBeenCalledWith(40, "compressing", { layer: 2, layers: 3 })
  })
})
