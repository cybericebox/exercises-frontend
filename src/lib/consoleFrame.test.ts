import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { consoleFrameSrc, devFrameSrc, isConsoleFrameUrl, labsHost } from "./consoleFrame"

const frameSrcLine = () => readFileSync("deploy/csp.sh", "utf8").split("\n").filter((line) => line.startsWith("frame_src="))

describe("console frame", () => {
  it("frame-src is the labs domain over https", () => {
    expect(labsHost("example.test")).toBe("labs.example.test")
    expect(consoleFrameSrc("example.test")).toBe("https://*.labs.example.test")
  })

  it("the container CSP builds the same labs domain with the same rule, with no blob: and no broader wildcard", () => {
    const shell = execFileSync("sh", ["-c", ". ./deploy/base-domain.sh; base_domain_host labs"], { env: { ...process.env, NEXT_PUBLIC_DOMAIN: "example.test" } }).toString().trim()
    expect(shell).toBe(labsHost("example.test"))
    expect(frameSrcLine()).toEqual(['frame_src="https://*.$(base_domain_host labs)"'])
    const line = frameSrcLine()[0]
    expect(line).not.toContain("blob:")
    expect(line).not.toContain("http:")
    expect((line.match(/\*/g) ?? []).length).toBe(1)
  })

  it("lets only one label under the labs domain into a frame", () => {
    const ok = (link: string) => isConsoleFrameUrl(link, "example.test")
    expect(ok("https://r1-ab1t.labs.example.test/session?t=1")).toBe(true)
    expect(ok("https://a.labs.example.test/")).toBe(true)
    expect(ok("https://r1-ab12.labs.example.test/_auth?t=x")).toBe(true)
    // deeper subdomain, other hosts, lookalikes
    expect(ok("https://x.r1-ab1t.labs.example.test/")).toBe(false)
    expect(ok("https://labs.example.test/")).toBe(false)
    expect(ok("https://r1-ab1t.example.test/")).toBe(false)
    expect(ok("https://r1-ab1t.labs.example.test.evil.tld/")).toBe(false)
    expect(ok("https://r1-ab1t.labs.example.testevil.tld/")).toBe(false)
    expect(ok("https://R1.labs.example.test/")).toBe(true) // the URL parser lowercases the host
    expect(ok("https://-r1.labs.example.test/")).toBe(false)
    expect(ok("https://r1-.labs.example.test/")).toBe(false)
    expect(ok("https://r_1.labs.example.test/")).toBe(false)
    // scheme, port, userinfo, garbage
    expect(ok("http://r1-ab1t.labs.example.test/")).toBe(false)
    expect(ok("https://r1-ab1t.labs.example.test:8443/")).toBe(false)
    expect(ok("https://user:pw@r1-ab1t.labs.example.test/")).toBe(false)
    expect(ok("not a url")).toBe(false)
    expect(isConsoleFrameUrl("https://r1-ab1t.labs.example.test/", undefined)).toBe(false)
  })
})

describe("dev frame-src", () => {
  it("allows blob: and the page itself only in the fixture mode, and never in the container policy", () => {
    expect(devFrameSrc("example.test", false)).toBe("https://*.labs.example.test")
    expect(devFrameSrc("example.test", true)).toBe("https://*.labs.example.test 'self' blob:")
    expect(devFrameSrc("example.test", false)).not.toContain("blob:")
    expect(frameSrcLine()[0]).not.toContain("blob:")
  })
})
