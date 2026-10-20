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

  it("never answers a personal rate limit with the overloaded message", () => {
    expect(localizedError(apiErr(429, 70428, 30))).not.toBe(t("error.overloaded"))
  })

  it("has a plain message when no wait is known", () => {
    expect(localizedError(apiErr(429, 70428))).toBe(t("error.tooManyRequests"))
  })
})

describe("localizedError on a 503", () => {
  it("answers an overload 503 (Retry-After) with the overloaded message", () => {
    expect(localizedError(apiErr(503, undefined, 1))).toBe(t("error.overloaded"))
    expect(localizedError(apiErr(503, undefined, 0))).toBe(t("error.overloaded"))
  })

  it("answers the overload codes without a catalog message with the overloaded message", () => {
    expect(localizedError(apiErr(503, 70431))).toBe(t("error.overloaded"))
    expect(localizedError(apiErr(503, 70432, 2))).toBe(t("error.overloaded"))
  })

  it("keeps the generic message for a bare 503", () => {
    expect(localizedError(apiErr(503, undefined))).toBe(t("error.generic"))
  })

  it("has the exact copy for the overloaded keys", () => {
    expect(t("error.overloaded")).toBe("Сервер перевантажений, спробуйте за декілька секунд")
    expect(t("error.overloaded.retry")).toBe("Спробувати ще раз")
  })
})
