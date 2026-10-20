import { describe, expect, it } from "vitest"
import { proxyHandoffURL } from "./proxyDestination"
describe("proxy handoff destination", () => {
 it("keeps the fresh token and encodes only the relative destination", () => {
  const url = new URL(proxyHandoffURL("https://fresh.test/_auth?t=fresh", "/panel?x=1#details"))
  expect(url.searchParams.get("t")).toBe("fresh")
  expect(url.searchParams.get("next")).toBe("/panel?x=1#details")
 })
 it("keeps existing root handoffs unchanged", () => {
  expect(proxyHandoffURL("https://fresh.test/_auth?t=fresh")).toBe("https://fresh.test/_auth?t=fresh")
  expect(proxyHandoffURL("https://fresh.test/_auth?t=fresh", "/")).toBe("https://fresh.test/_auth?t=fresh")
 })
 it.each(["https://evil.test/", "//evil.test/", "/\\evil.test", "/%5cevil.test", "/panel\nLocation:evil", "/_auth?t=stale", "/%5fauth", "/a/../_auth", "/_auth/", "/a/..//evil.test/path", "/panel//nested"])("rejects an unsafe or reserved relative destination: %s", next => {
  expect(() => proxyHandoffURL("https://fresh.test/_auth?t=fresh", next)).toThrow()
 })
})
