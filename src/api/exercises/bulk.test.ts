import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/api/client", async (orig) => ({ ...(await orig<typeof import("@/api/client")>()), apiPost: vi.fn(), apiPut: vi.fn() }))

import { ApiError, apiPost, apiPut } from "@/api/client"
import { BULK_CHUNK, bulkArchive, bulkSetAccess, bulkUnarchive, runBulk } from "./bulk"

const ids = (n: number) => Array.from({ length: n }, (_, i) => `ex-${i + 1}`)

beforeEach(() => vi.clearAllMocks())

describe("bulk catalog actions", () => {
  it("posts the IDs to the bulk routes and normalizes the changed cards", async () => {
    vi.mocked(apiPost).mockResolvedValue({ Changed: 1, Skipped: 1, Items: [{ ID: "a", Exercise: { ID: "a", Name: "A", ArchivedAt: "2026-10-19T10:00:00Z" }, Code: 0 }, { ID: "b", Exercise: null, Code: 60957 }] })
    const result = await bulkArchive(["a", "b"])
    expect(apiPost).toHaveBeenCalledWith("/api/exercises/bulk/archive", { IDs: ["a", "b"] })
    expect(result[0].Exercise).toMatchObject({ ID: "a", Tags: [], AccessEventIDs: [], ArchivedAt: "2026-10-19T10:00:00Z" })
    expect(result[1]).toEqual({ ID: "b", Exercise: null, Code: 60957 })
    await bulkUnarchive(["a"])
    expect(apiPost).toHaveBeenLastCalledWith("/api/exercises/bulk/unarchive", { IDs: ["a"] })
  })

  it("sends the access level, with events only for «selected»", async () => {
    vi.mocked(apiPut).mockResolvedValue({ Changed: 0, Skipped: 0, Items: [] })
    await bulkSetAccess(["a"], { AccessLevel: "none", EventIDs: ["e1"] })
    expect(apiPut).toHaveBeenCalledWith("/api/exercises/bulk/access", { IDs: ["a"], AccessLevel: "none", EventIDs: [] })
    await bulkSetAccess(["a"], { AccessLevel: "selected", EventIDs: ["e1"] })
    expect(apiPut).toHaveBeenLastCalledWith("/api/exercises/bulk/access", { IDs: ["a"], AccessLevel: "selected", EventIDs: ["e1"] })
  })

  it("runs the selection in chunks and reports the progress after each", async () => {
    const call = vi.fn(async (chunk: string[]) => chunk.map((ID) => ({ ID, Exercise: null, Code: 0 })))
    const progress = vi.fn()
    const items = await runBulk(ids(BULK_CHUNK * 2 + 3), call, progress)
    expect(call).toHaveBeenCalledTimes(3)
    expect(items).toHaveLength(BULK_CHUNK * 2 + 3)
    expect(progress.mock.calls).toEqual([[0, 23], [10, 23], [20, 23], [23, 23]])
  })

  it("keeps going when one chunk fails: its tasks carry the error code", async () => {
    const call = vi.fn()
      .mockRejectedValueOnce(new ApiError(503, { Status: { Code: 70433 } }, "busy", undefined, 70433))
      .mockImplementation(async (chunk: string[]) => chunk.map((ID) => ({ ID, Exercise: null, Code: 0 })))
    const items = await runBulk(ids(BULK_CHUNK + 1), call, vi.fn())
    expect(items.slice(0, BULK_CHUNK).every((item) => item.Code === 70433 && item.Exercise === null)).toBe(true)
    expect(items[BULK_CHUNK]).toEqual({ ID: `ex-${BULK_CHUNK + 1}`, Exercise: null, Code: 0 })
  })

  it("marks a chunk lost without an API code with -1", async () => {
    const items = await runBulk(["a"], vi.fn().mockRejectedValue(new Error("offline")), vi.fn())
    expect(items).toEqual([{ ID: "a", Exercise: null, Code: -1 }])
  })
})
