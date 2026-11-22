import { afterEach, describe, expect, it, vi } from "vitest"
import { fetchDraftKey } from "./draftKey"

afterEach(() => { vi.unstubAllGlobals() })

describe("fetchDraftKey", () => {
  it("posts with credentials and reads the key out of the backend's envelope", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ Status: { Code: 0, Message: "ok" }, Data: { ID: "key-1", Key: "a2V5" } }), {
      status: 200, headers: { "content-type": "application/json" },
    }))
    vi.stubGlobal("fetch", fetchMock)
    await expect(fetchDraftKey()).resolves.toEqual({ ID: "key-1", Key: "a2V5" })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/api\/me\/draft-key$/)
    expect(init).toMatchObject({ method: "POST", credentials: "include" })
  })
})
