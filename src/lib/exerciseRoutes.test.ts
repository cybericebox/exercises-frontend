import { describe, expect, it } from "vitest"
import { testLabStartHref } from "./exerciseRoutes"

describe("testLabStartHref", () => {
  it("names the variant and adds the run length only when one is chosen", () => {
    expect(testLabStartHref("e", "v", "x")).toBe("/test?exercise=e&version=v&variant=x")
    expect(testLabStartHref("e", "v", "x", 120)).toBe("/test?exercise=e&version=v&variant=x&minutes=120")
  })
})
