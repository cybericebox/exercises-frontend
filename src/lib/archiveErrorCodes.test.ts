import { describe, expect, it } from "vitest"
import errorsEn from "../../messages/errors.en.json"
import errorsUk from "../../messages/errors.uk.json"
import { ARCHIVE_CONTENT_ERROR_CODES } from "@/lib/exerciseErrors"

describe("ARCHIVE_CONTENT_ERROR_CODES", () => {
  it.each([...ARCHIVE_CONTENT_ERROR_CODES])("%i has a uk and an en text", (code) => {
    expect((errorsUk as Record<string, string>)[String(code)]).toBeTruthy()
    expect((errorsEn as Record<string, string>)[String(code)]).toBeTruthy()
  })
})
