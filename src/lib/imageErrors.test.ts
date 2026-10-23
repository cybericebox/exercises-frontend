import { describe, it, expect, vi } from "vitest"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, unknown>) => vars ? `${key} ${JSON.stringify(vars)}` : key }))

import { ApiError } from "@/api/client"
import { imageUploadErrorMessage, registryErrorHelp } from "./imageErrors"

const apiError = (code: number, context?: Record<string, string>) => new ApiError(409, { Status: { Code: code, Context: context } }, undefined, undefined, code)

describe("image registry errors", () => {
  it("72832: the registry refused access, its own text; an admin also reads which token", () => {
    const error = apiError(72832, { token: "push", reason: "unauthorized" })
    expect(imageUploadErrorMessage(error, false)).toBe("exercises.image.accessDenied")
    expect(imageUploadErrorMessage(error, true)).toBe('exercises.image.accessDeniedToken {"token":"exercises.image.token.push"}')
    expect(imageUploadErrorMessage(apiError(72832, { token: "pull" }), true)).toBe('exercises.image.accessDeniedToken {"token":"exercises.image.token.pull"}')
    // No (or an unknown) token: the general line, never a raw context value.
    expect(imageUploadErrorMessage(apiError(72832), true)).toBe("exercises.image.accessDenied")
    expect(imageUploadErrorMessage(apiError(72832, { token: "<b>x</b>" }), true)).toBe("exercises.image.accessDenied")
  })

  it("72801/72802 stay the upload refusal", () => {
    expect(imageUploadErrorMessage(apiError(72801), false)).toBe("exercises.image.refused")
    expect(imageUploadErrorMessage(apiError(72802, { reason: "unreachable" }), true)).toBe('exercises.image.refusedReason {"reason":"exercises.image.reason.unreachable"}')
  })

  it("a configuration or access failure points to the platform panel; an outage keeps the general help", () => {
    expect(registryErrorHelp(apiError(72801))).toBe("exercises.image.registryHelp")
    expect(registryErrorHelp(apiError(72832, { token: "pull" }))).toBe("exercises.image.registryHelp")
    expect(registryErrorHelp(apiError(72802))).toBeNull()
    expect(registryErrorHelp(new TypeError("offline"))).toBeNull()
  })
})
