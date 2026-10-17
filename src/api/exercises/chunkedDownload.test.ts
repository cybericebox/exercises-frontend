import { beforeEach, describe, expect, it, vi } from "vitest"
import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex } from "@noble/hashes/utils.js"

vi.mock("@/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/client")>()),
  apiGet: vi.fn(),
  apiGetBlob: vi.fn(),
}))

import * as client from "@/api/client"
import { DownloadHashMismatchError, downloadInChunks, forgetDownload } from "./chunkedDownload"

const mockGet = vi.mocked(client.apiGet)
const mockBlob = vi.mocked(client.apiGetBlob)
const enc = new TextEncoder()
const parts = ["hel", "lo ", "wo", "rld"]
const whole = parts.join("")
const hash = bytesToHex(sha256(enc.encode(whole)))
const noSleep = { sleep: async () => undefined }

function meta(sha = hash) {
  return { Name: "web.cybericebox.zip", Size: whole.length, ChunkSize: 3, Chunks: parts.length, SHA256: sha }
}

function serve(failIndex = -1, failure: unknown = new client.ApiError(404, null)) {
  mockBlob.mockImplementation(async (path: string) => {
    const index = Number(path.split("/").pop())
    if (index === failIndex) throw failure
    return { blob: new Blob([parts[index]]), filename: null }
  })
}

describe("downloadInChunks", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("assembles chunks in order", async () => {
    mockGet.mockResolvedValue(meta())
    serve()
    const progress = vi.fn()
    const result = await downloadInChunks("f1", progress, noSleep)
    expect(await result.blob.text()).toBe(whole)
    expect(result.name).toBe("web.cybericebox.zip")
    expect(mockGet).toHaveBeenCalledWith("/api/exercises/files/f1/meta")
    expect(mockBlob.mock.calls.map((call) => call[0])).toEqual([0, 1, 2, 3].map((i) => `/api/exercises/files/f1/chunks/${i}`))
    expect(progress).toHaveBeenLastCalledWith(100)
  })

  it("resumes from the first missing chunk after a failure", async () => {
    mockGet.mockResolvedValue(meta())
    serve(2)
    await expect(downloadInChunks("f2", undefined, noSleep)).rejects.toBeInstanceOf(client.ApiError)
    mockBlob.mockClear()
    serve()
    const result = await downloadInChunks("f2", undefined, noSleep)
    expect(await result.blob.text()).toBe(whole)
    expect(mockBlob.mock.calls.map((call) => call[0])).toEqual([2, 3].map((i) => `/api/exercises/files/f2/chunks/${i}`))
  })

  it("keeps retried chunk failures silent and lets only the last attempt report an outage", async () => {
    mockGet.mockResolvedValue(meta())
    mockBlob.mockRejectedValue(new TypeError("network failed"))
    await expect(downloadInChunks("f-silent", undefined, noSleep)).rejects.toBeInstanceOf(TypeError)
    forgetDownload("f-silent")
    const options = mockBlob.mock.calls.map((call) => call[1])
    expect(options.length).toBeGreaterThan(1)
    expect(options.slice(0, -1).every((option) => option?.silentOutage === true)).toBe(true)
    expect(options.at(-1)?.silentOutage).toBe(false)
  })

  it("retries a transient chunk failure", async () => {
    mockGet.mockResolvedValue(meta())
    let failures = 1
    mockBlob.mockImplementation(async (path: string) => {
      const index = Number(path.split("/").pop())
      if (index === 1 && failures-- > 0) throw new client.ApiError(503, null)
      return { blob: new Blob([parts[index]]), filename: null }
    })
    const result = await downloadInChunks("f3", undefined, noSleep)
    expect(await result.blob.text()).toBe(whole)
  })

  it("rejects a hash mismatch and starts over next time", async () => {
    mockGet.mockResolvedValue(meta("0".repeat(64)))
    serve()
    await expect(downloadInChunks("f4", undefined, noSleep)).rejects.toBeInstanceOf(DownloadHashMismatchError)
    mockBlob.mockClear()
    await expect(downloadInChunks("f4", undefined, noSleep)).rejects.toThrow()
    expect(mockBlob).toHaveBeenCalledTimes(4)
  })

  it("handles a zero-byte file", async () => {
    mockGet.mockResolvedValue({ Name: "empty.zip", Size: 0, ChunkSize: 3, Chunks: 0, SHA256: bytesToHex(sha256(new Uint8Array())) })
    const result = await downloadInChunks("f5", undefined, noSleep)
    expect(result.blob.size).toBe(0)
    expect(mockBlob).not.toHaveBeenCalled()
  })

  it("forgetDownload drops the kept chunks", async () => {
    mockGet.mockResolvedValue(meta())
    serve(2)
    await expect(downloadInChunks("f6", undefined, noSleep)).rejects.toBeInstanceOf(client.ApiError)
    forgetDownload("f6")
    mockBlob.mockClear()
    serve()
    await downloadInChunks("f6", undefined, noSleep)
    expect(mockBlob).toHaveBeenCalledTimes(4)
  })
})
