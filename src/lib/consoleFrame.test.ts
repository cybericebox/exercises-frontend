import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { consoleFrameHost, consoleFrameOrigin, devFrameSrc, isConsoleFrameUrl } from "./consoleFrame"

describe("console frame origin", () => {
  it("is terminal.labs.<domain> over https", () => {
    expect(consoleFrameHost("example.test")).toBe("terminal.labs.example.test")
    expect(consoleFrameOrigin("example.test")).toBe("https://terminal.labs.example.test")
  })

  it("is the same host the container CSP script builds", () => {
    const shell = execFileSync("sh", ["-c", ". ./deploy/base-domain.sh; base_domain_host terminal.labs"], { env: { ...process.env, NEXT_PUBLIC_DOMAIN: "example.test" } }).toString().trim()
    expect(shell).toBe(consoleFrameHost("example.test"))
    const csp = execFileSync("grep", ["-n", "frame_src=", "deploy/csp.sh"]).toString()
    expect(csp).toContain("terminal.labs")
    expect(csp).not.toContain("*")
  })

  it("lets only that origin into a frame", () => {
    const ok = (link: string) => isConsoleFrameUrl(link, "example.test")
    expect(ok("https://terminal.labs.example.test/session?t=1")).toBe(true)
    expect(ok("http://terminal.labs.example.test/")).toBe(false)
    expect(ok("https://terminal.labs.example.test:8443/")).toBe(false)
    expect(ok("https://other.labs.example.test/")).toBe(false)
    expect(ok("https://terminal.labs.example.test.evil.test/")).toBe(false)
    expect(ok("https://user:pw@terminal.labs.example.test/")).toBe(false)
    expect(ok("not a url")).toBe(false)
    expect(isConsoleFrameUrl("https://terminal.labs.example.test/", undefined)).toBe(false)
  })
})

describe("dev frame-src", () => {
  it("allows blob: and the page itself only in the fixture mode, and never in the container policy", () => {
    expect(devFrameSrc("example.test", false)).toBe("https://terminal.labs.example.test")
    expect(devFrameSrc("example.test", true)).toBe("https://terminal.labs.example.test 'self' blob:")
    expect(devFrameSrc("example.test", false)).not.toContain("blob:")
    expect(readFileSync("deploy/csp.sh", "utf8").split("\n").filter((line) => line.startsWith("frame_src="))).toEqual(['frame_src="https://$(base_domain_host terminal.labs)"'])
  })
})
