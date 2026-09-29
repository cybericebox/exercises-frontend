import { describe, expect, it } from "vitest"
import { initials } from "./initials"

describe("initials", () => {
  it("uppercases the first letters of the first and last name", () => {
    expect(initials("іван", "петренко")).toBe("ІП")
    expect(initials(" ivan ", " petrenko ")).toBe("IP")
  })
  it("falls back to the e-mail, then to ?", () => {
    expect(initials("", "", "olena@example.com")).toBe("O")
    expect(initials(undefined, null)).toBe("?")
  })
})
