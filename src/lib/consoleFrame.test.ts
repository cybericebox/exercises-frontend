import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { consoleFrameSrc, devFrameSrc, isConsoleFrameUrl, labDomainList, labsHost } from "./consoleFrame"

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
describe("extra lab domains", () => {
  it("keeps plain domain names only, lowercased, once each", () => {
    expect(labDomainList(undefined)).toEqual([])
    expect(labDomainList("")).toEqual([])
    expect(labDomainList("__NEXT_PUBLIC_LAB_DOMAINS__")).toEqual([])
    expect(labDomainList(" Labs.Other.Example , labs.second.example,labs.other.example")).toEqual(["labs.other.example", "labs.second.example"])
    expect(labDomainList("localhost,https://labs.x.example,labs.x.example:8443,labs.x.example/path,*.x.example,-a.example,a..example,'self'")).toEqual([])
    expect(labDomainList(`${"a".repeat(250)}.example`)).toEqual([])
  })

  it("widens frame-src by each of them and nothing else", () => {
    expect(consoleFrameSrc("example.test", ["labs.other.example"])).toBe("https://*.labs.example.test https://*.labs.other.example")
    expect(consoleFrameSrc("example.test", ["labs.example.test"])).toBe("https://*.labs.example.test")
    expect(devFrameSrc("example.test", false, ["labs.other.example"])).toBe("https://*.labs.example.test https://*.labs.other.example")
    expect(devFrameSrc("example.test", true, ["labs.other.example"])).toBe("https://*.labs.example.test https://*.labs.other.example 'self' blob:")
  })

  it("frames one label under an extra lab domain, by the same rule as under the labs domain", () => {
    const ok = (link: string) => isConsoleFrameUrl(link, "example.test", ["labs.other.example"])
    expect(ok("https://r1-ab1t.labs.other.example/session")).toBe(true)
    expect(ok("https://r1-ab1t.labs.example.test/")).toBe(true)
    expect(ok("https://x.r1-ab1t.labs.other.example/")).toBe(false)
    expect(ok("https://labs.other.example/")).toBe(false)
    expect(ok("https://r1-ab1t.other.example/")).toBe(false)
    expect(ok("https://r1-ab1t.labs.other.example.evil.tld/")).toBe(false)
    expect(ok("http://r1-ab1t.labs.other.example/")).toBe(false)
    expect(ok("https://r1-ab1t.labs.other.example:8443/")).toBe(false)
    expect(ok("https://user@r1-ab1t.labs.other.example/")).toBe(false)
    // without the list the other domain is refused
    expect(isConsoleFrameUrl("https://r1-ab1t.labs.other.example/", "example.test")).toBe(false)
  })

  it("reaches the container the same way: a placeholder in the image, checked and exported by the entrypoint, added to frame-src by csp.sh", () => {
    expect(readFileSync("deploy/Dockerfile", "utf8")).toContain('NEXT_PUBLIC_LAB_DOMAINS="__NEXT_PUBLIC_LAB_DOMAINS__"')
    const entrypoint = readFileSync("deploy/docker-entrypoint.sh", "utf8")
    expect(entrypoint).toContain("*[!A-Za-z0-9.,-]*)")
    expect(entrypoint).toContain("export NEXT_PUBLIC_LAB_DOMAINS")
    expect(readFileSync("deploy/csp.sh", "utf8")).toContain('frame_src="$frame_src https://*.$entry"')
    const check = (value: string) => {
      try { execFileSync("sh", ["-c", 'case "$V" in *[!A-Za-z0-9.,-]*) exit 1 ;; esac'], { env: { ...process.env, V: value } }); return true } catch { return false }
    }
    expect(check("labs.other.example,labs.second.example")).toBe(true)
    expect(check("")).toBe(true)
    expect(check('labs.x.example" onload="x')).toBe(false)
    expect(check("labs.x.example;frame-src *")).toBe(false)
    expect(check("https://labs.x.example")).toBe(false)
  })
})
