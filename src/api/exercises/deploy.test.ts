import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/api/client", async (orig) => ({ ...(await orig<typeof import("@/api/client")>()), apiPost: vi.fn() }))

import { apiPost } from "@/api/client"
import { openDeployLink } from "./deploy"

beforeEach(() => vi.clearAllMocks())

describe("openDeployLink", () => {
  it("posts the device and returns the endpoint with its grant", async () => {
    vi.mocked(apiPost).mockResolvedValue({ URL: "https://web-1x.labs.test/_auth", Grant: "a.b.c", ExpiresAt: "2026-10-01T00:00:00Z" })
    expect(await openDeployLink("g1", "web", 443)).toEqual({ URL: "https://web-1x.labs.test/_auth", Grant: "a.b.c", ExpiresAt: "2026-10-01T00:00:00Z" })
    expect(apiPost).toHaveBeenCalledWith(expect.stringMatching(/\/deploys\/g1\/link$/), { Device: "web", Port: 443 })
  })

  it.each([{ Grant: undefined }, { Grant: "" }, { URL: "https://web-1x.labs.test/_auth?t=old" }, { URL: "https://web-1x.labs.test/_auth#x" }, { URL: undefined }])("refuses an answer without a grant or with a credential-shaped URL %j", async (fields) => {
    vi.mocked(apiPost).mockResolvedValue({ URL: "https://web-1x.labs.test/_auth", Grant: "a.b.c", ExpiresAt: "x", ...fields })
    await expect(openDeployLink("g1", "web", 443)).rejects.toThrow()
  })
})
