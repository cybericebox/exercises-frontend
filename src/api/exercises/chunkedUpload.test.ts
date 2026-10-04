import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex } from "@noble/hashes/utils.js"
import { ApiError } from "@/api/client"
import { apiOrigin } from "@/lib/origins"
import { chunkedUploadKey } from "@/lib/storageKeys"
import { abandonChunkedUpload, uploadInChunks } from "./chunkedUpload"
import { uploadExerciseFile } from "./files"

const UPLOAD_ID = "11111111-2222-3333-4444-555555555555"
const FILE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

class ChunkRequest {
  static instances: ChunkRequest[] = []
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  withCredentials = false
  status = 200
  responseText = ""
  open = vi.fn()
  send = vi.fn()
  setRequestHeader = vi.fn()
  abort = vi.fn(() => this.onabort?.())
  getResponseHeader = vi.fn().mockReturnValue(null)
  constructor() { ChunkRequest.instances.push(this) }
}

const envelope = (data: unknown) => JSON.stringify({ Status: { Code: 10000, Message: "Success" }, Data: data })
const status = (received: number, over: Partial<Record<string, unknown>> = {}) =>
  ({ UploadID: UPLOAD_ID, Name: "big.bin", Size: 10, ChunkSize: 4, Chunks: 3, ChunksReceived: received, ReceivedBytes: received * 4, ExpiresAt: "x", ...over })

const JSON_HEADERS = { "Content-Type": "application/json" }
function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify({ Status: { Code: 10000, Message: "Success" }, Data: body }), { status: 200, headers: JSON_HEADERS })
}
const errorResponse = (httpStatus: number, code: number) =>
  new Response(JSON.stringify({ Status: { Code: code, Message: "x" } }), { status: httpStatus, headers: JSON_HEADERS })

/** Answers the chunk requests one after the other, as the server would: each waits for its request to be sent. */
async function answerChunks(answers: Array<(req: ChunkRequest) => void>) {
  for (const [index, answer] of answers.entries()) {
    await vi.waitFor(() => expect(ChunkRequest.instances.length).toBeGreaterThan(index))
    answer(ChunkRequest.instances[index])
  }
}
const ok = (data: unknown) => (req: ChunkRequest) => { req.status = 200; req.responseText = envelope(data); req.onload?.() }
const fail = (httpStatus: number, code: number) => (req: ChunkRequest) => { req.status = httpStatus; req.responseText = JSON.stringify({ Status: { Code: code, Message: "x" } }); req.onload?.() }
const lost = () => (req: ChunkRequest) => req.onerror?.()

function bigFile(): File {
  const file = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])], "big.bin", { type: "application/octet-stream", lastModified: 1 })
  return file
}

const noSleep = { sleep: () => Promise.resolve() }

describe("chunked upload", () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    ChunkRequest.instances = []
    vi.stubGlobal("XMLHttpRequest", ChunkRequest)
    fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    window.localStorage.clear()
  })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it("starts, sends the chunks in order with the raw bytes, then completes with the sha256 of the whole file", async () => {
    const file = bigFile()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(status(0)))
      .mockResolvedValueOnce(jsonResponse({ FileID: FILE_ID, Name: "big.bin", Size: 10 }))
    const progress = vi.fn()
    const promise = uploadInChunks(file, progress, undefined, noSleep)
    await answerChunks([ok(status(1)), ok(status(2)), ok(status(3))])
    await expect(promise).resolves.toEqual({ FileID: FILE_ID, Name: "big.bin", Size: 10 })

    const start = fetchMock.mock.calls[0]
    expect(start[0]).toBe(`${apiOrigin}/api/exercises/uploads`)
    expect(JSON.parse(start[1].body as string)).toEqual({ Name: "big.bin", ContentType: "application/octet-stream", Size: 10 })
    const puts = ChunkRequest.instances
    expect(puts.map((r) => r.open.mock.calls[0])).toEqual([
      ["PUT", `${apiOrigin}/api/exercises/uploads/${UPLOAD_ID}/chunks/0`],
      ["PUT", `${apiOrigin}/api/exercises/uploads/${UPLOAD_ID}/chunks/1`],
      ["PUT", `${apiOrigin}/api/exercises/uploads/${UPLOAD_ID}/chunks/2`],
    ])
    expect(puts.every((r) => r.withCredentials)).toBe(true)
    const sizes = puts.map((r) => (r.send.mock.calls[0][0] as Blob).size)
    expect(sizes).toEqual([4, 4, 2])
    const complete = fetchMock.mock.calls[1]
    expect(complete[0]).toBe(`${apiOrigin}/api/exercises/uploads/${UPLOAD_ID}/complete`)
    expect(JSON.parse(complete[1].body as string)).toEqual({ SHA256: bytesToHex(sha256(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))) })
    expect(progress).toHaveBeenLastCalledWith(100)
    const values = progress.mock.calls.map((c) => c[0] as number)
    expect(values.slice(0, -1).every((v) => v < 100)).toBe(true)
    expect(window.localStorage.getItem(chunkedUploadKey("big.bin:10:1"))).toBeNull()
  })

  it("resumes from the first chunk the server does not have, still hashing the chunks it has", async () => {
    const file = bigFile()
    window.localStorage.setItem(chunkedUploadKey("big.bin:10:1"), UPLOAD_ID)
    fetchMock
      .mockResolvedValueOnce(jsonResponse(status(2)))
      .mockResolvedValueOnce(jsonResponse({ FileID: FILE_ID, Name: "big.bin", Size: 10 }))
    const promise = uploadInChunks(file, undefined, undefined, noSleep)
    await answerChunks([ok(status(3))])
    await promise
    expect(fetchMock.mock.calls[0][0]).toBe(`${apiOrigin}/api/exercises/uploads/${UPLOAD_ID}`)
    expect(ChunkRequest.instances).toHaveLength(1)
    expect(ChunkRequest.instances[0].open.mock.calls[0][1]).toMatch(/chunks\/2$/)
    const complete = JSON.parse(fetchMock.mock.calls[1][1].body as string)
    expect(complete.SHA256).toBe(bytesToHex(sha256(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))))
  })

  it("starts over when the server no longer knows the stored upload", async () => {
    window.localStorage.setItem(chunkedUploadKey("big.bin:10:1"), "old-id")
    fetchMock
      .mockResolvedValueOnce(errorResponse(404, 31006))
      .mockResolvedValueOnce(jsonResponse(status(0)))
      .mockResolvedValueOnce(jsonResponse({ FileID: FILE_ID, Name: "big.bin", Size: 10 }))
    const promise = uploadInChunks(bigFile(), undefined, undefined, noSleep)
    await answerChunks([ok(status(1)), ok(status(2)), ok(status(3))])
    await promise
    expect(fetchMock.mock.calls[1][0]).toBe(`${apiOrigin}/api/exercises/uploads`)
  })

  it("sends a chunk again after a lost connection, with a backoff", async () => {
    const sleeps: number[] = []
    fetchMock
      .mockResolvedValueOnce(jsonResponse(status(0)))
      .mockResolvedValueOnce(jsonResponse({ FileID: FILE_ID, Name: "big.bin", Size: 10 }))
    const promise = uploadInChunks(bigFile(), undefined, undefined, { sleep: (ms) => { sleeps.push(ms); return Promise.resolve() } })
    await answerChunks([lost(), lost(), ok(status(1)), ok(status(2)), ok(status(3))])
    await promise
    expect(sleeps).toEqual([1000, 2000])
    expect(ChunkRequest.instances.slice(0, 3).map((r) => r.open.mock.calls[0][1].split("/").pop())).toEqual(["0", "0", "0"])
  })

  it("gives up after the attempts and keeps the upload id so a repeated call resumes", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(status(0)))
    const promise = uploadInChunks(bigFile(), undefined, undefined, noSleep)
    const settled = promise.catch((e: unknown) => e)
    await answerChunks([lost(), lost(), lost(), lost()])
    expect(await settled).toBeInstanceOf(ApiError)
    expect(window.localStorage.getItem(chunkedUploadKey("big.bin:10:1"))).toBe(UPLOAD_ID)
  })

  it("does not repeat a chunk the server refused with a client error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(status(0)))
    const promise = uploadInChunks(bigFile(), undefined, undefined, noSleep)
    const settled = promise.catch((e: unknown) => e)
    await answerChunks([fail(400, 21008)])
    const error = await settled
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe(21008)
    expect(ChunkRequest.instances).toHaveLength(1)
  })

  it("re-reads the server status and carries on when a chunk arrives out of order", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(status(0)))
      .mockResolvedValueOnce(jsonResponse(status(1)))
      .mockResolvedValueOnce(jsonResponse({ FileID: FILE_ID, Name: "big.bin", Size: 10 }))
    const promise = uploadInChunks(bigFile(), undefined, undefined, noSleep)
    await answerChunks([fail(409, 71007), ok(status(2)), ok(status(3))])
    await promise
    expect(ChunkRequest.instances.map((r) => r.open.mock.calls[0][1].split("/").pop())).toEqual(["0", "1", "2"])
  })

  it("forgets a file the server refused to assemble, so the next try starts from nothing", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(status(0)))
      .mockResolvedValueOnce(errorResponse(400, 21010))
    const promise = uploadInChunks(bigFile(), undefined, undefined, noSleep)
    const settled = promise.catch((e: unknown) => e)
    await answerChunks([ok(status(1)), ok(status(2)), ok(status(3))])
    expect(((await settled) as ApiError).code).toBe(21010)
    expect(window.localStorage.getItem(chunkedUploadKey("big.bin:10:1"))).toBeNull()
  })

  it("abandoning drops the stored id and asks the server to drop the chunks", async () => {
    window.localStorage.setItem(chunkedUploadKey("big.bin:10:1"), UPLOAD_ID)
    fetchMock.mockResolvedValueOnce(jsonResponse({}))
    await abandonChunkedUpload(bigFile())
    expect(fetchMock.mock.calls[0][0]).toBe(`${apiOrigin}/api/exercises/uploads/${UPLOAD_ID}`)
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE")
    expect(window.localStorage.getItem(chunkedUploadKey("big.bin:10:1"))).toBeNull()
  })

  it("an aborted upload stops the running chunk and fails", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(status(0)))
    const controller = new AbortController()
    const promise = uploadInChunks(bigFile(), undefined, controller.signal, noSleep)
    const settled = promise.catch((e: unknown) => e)
    await vi.waitFor(() => expect(ChunkRequest.instances).toHaveLength(1))
    controller.abort()
    expect(((await settled) as ApiError).message).toBe("Upload aborted")
    expect(ChunkRequest.instances[0].abort).toHaveBeenCalled()
  })
})

describe("uploadExerciseFile", () => {
  beforeEach(() => { ChunkRequest.instances = []; vi.stubGlobal("XMLHttpRequest", ChunkRequest) })
  afterEach(() => { vi.unstubAllGlobals() })

  it("sends a file up to one chunk in a single multipart request", () => {
    void uploadExerciseFile(new File(["hello"], "notes.txt"))
    expect(ChunkRequest.instances).toHaveLength(1)
    expect(ChunkRequest.instances[0].open).toHaveBeenCalledWith("POST", `${apiOrigin}/api/exercises/files`)
  })
})
