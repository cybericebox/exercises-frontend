import { describe, it, expect } from "vitest"
import { ApiError } from "@/api/client"
import { localizedError } from "./apiError"
import { t } from "./t"

const apiErr = (status: number, code: number | undefined, retryAfter?: number) =>
  new ApiError(status, undefined, undefined, undefined, code, retryAfter)

describe("localizedError on a 429", () => {
  it("shows the wait for the coded 429 of every limiter", () => {
    expect(localizedError(apiErr(429, 70428, 30))).toBe(t("error.tooManyRequests.wait", { seconds: 30 }))
  })

  it("shows the wait for a bare 429 too", () => {
    expect(localizedError(apiErr(429, undefined, 30))).toBe(t("error.tooManyRequests.wait", { seconds: 30 }))
  })

  it("has a plain message when no wait is known", () => {
    expect(localizedError(apiErr(429, 70428))).toBe(t("error.tooManyRequests"))
  })
})
