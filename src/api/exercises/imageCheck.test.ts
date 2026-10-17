import { beforeEach, describe, expect, it, vi } from "vitest"

const apiPost = vi.fn()
vi.mock("@/api/client", async (original) => ({
  ...(await original<typeof import("@/api/client")>()),
  apiPost: (...args: unknown[]) => apiPost(...args),
}))

const { ApiError } = await import("@/api/client")
const { checkImages, unavailableImagesOf } = await import("./imageCheck")

beforeEach(() => { apiPost.mockReset() })

describe("checkImages", () => {
  it("asks the exercise check route with the distinct non-empty images", async () => {
    apiPost.mockResolvedValue([{ Image: "nginx:1", Status: "available" }, { Image: "acme/x", Status: "unavailable", Reason: "needs_event_secret" }])
    const signal = new AbortController().signal
    const result = await checkImages("ex-1", ["nginx:1", " ", "acme/x", "nginx:1"], signal)
    expect(apiPost).toHaveBeenCalledWith("/api/exercises/ex-1/images/check", { Images: ["nginx:1", "acme/x"] }, { signal })
    expect(result).toEqual([{ Image: "nginx:1", Status: "available" }, { Image: "acme/x", Status: "unavailable", Reason: "needs_event_secret" }])
  })

  it("asks nothing when there is no image", async () => {
    await expect(checkImages("ex-1", ["", "  "])).resolves.toEqual([])
    expect(apiPost).not.toHaveBeenCalled()
  })
})

describe("unavailableImagesOf", () => {
  it("reads the images of a refused deploy (409 72803)", () => {
    const body = { Status: { Code: 72803, Message: "x", Context: { images: [{ Image: "platform:web@sha256:aa", Status: "unavailable", Reason: "not_found" }] } } }
    expect(unavailableImagesOf(new ApiError(409, body, "x", undefined, 72803))).toEqual([{ Image: "platform:web@sha256:aa", Status: "unavailable", Reason: "not_found" }])
  })

  it("is null for any other error", () => {
    expect(unavailableImagesOf(new ApiError(409, { Status: { Code: 72509 } }, "x", undefined, 72509))).toBeNull()
    expect(unavailableImagesOf(new Error("x"))).toBeNull()
  })

  it("is an empty list for the code without a usable context", () => {
    expect(unavailableImagesOf(new ApiError(409, { Status: { Code: 72803 } }, "x", undefined, 72803))).toEqual([])
  })
})
