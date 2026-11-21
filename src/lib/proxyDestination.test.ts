import { describe, expect, it } from "vitest"
import { proxyDestinationNext } from "./proxyDestination"
describe("proxy destination", () => {
 it("returns only the validated relative path to post as next", () => {
  expect(proxyDestinationNext("https://fresh.test/_auth", "/panel?x=1#details")).toBe("/panel?x=1#details")
 })
 it("answers / without a destination or for the root", () => {
  expect(proxyDestinationNext("https://fresh.test/_auth")).toBe("/")
  expect(proxyDestinationNext("https://fresh.test/_auth", "/")).toBe("/")
 })
 it.each(["https://evil.test/", "//evil.test/", "/\\evil.test", "/%5cevil.test", "/panel\nLocation:evil", "/_auth?t=stale", "/%5fauth", "/a/../_auth", "/_auth/", "/a/..//evil.test/path", "/panel//nested"])("rejects an unsafe or reserved relative destination: %s", next => {
  expect(() => proxyDestinationNext("https://fresh.test/_auth", next)).toThrow()
 })
})
