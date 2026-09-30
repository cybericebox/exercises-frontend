import { describe, expect, it } from "vitest"
import { buildLinkUrl, isValidLinkPath, isValidLinkPort } from "./placeholderLink"

describe("placeholderLink", () => {
  it("validates the port", () => {
    for (const ok of ["", "1", "80", "8443", "65535"]) expect(isValidLinkPort(ok), ok).toBe(true)
    for (const bad of ["0", "65536", "-1", "80a", "1.5", "123456"]) expect(isValidLinkPort(bad), bad).toBe(false)
  })

  it("validates the path", () => {
    for (const ok of ["", "/", "/a/b", "/a?x=1&y=2#z"]) expect(isValidLinkPath(ok), ok).toBe(true)
    for (const bad of ["admin", "/a b", '/a"b', "/a'b", "/a<b", `/${"a".repeat(200)}`]) expect(isValidLinkPath(bad), bad).toBe(false)
  })

  it("builds the URL, omitting the default port", () => {
    expect(buildLinkUrl("http", "10.0.0.5")).toBe("http://10.0.0.5")
    expect(buildLinkUrl("https", "10.0.0.5", "8443", "/x")).toBe("https://10.0.0.5:8443/x")
    expect(buildLinkUrl("http", "10.0.0.5", 0, "/x")).toBe("http://10.0.0.5/x")
  })
})
