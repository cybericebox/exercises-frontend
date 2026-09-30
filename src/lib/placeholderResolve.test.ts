import { describe, it, expect } from "vitest"
import { resolvePlaceholder, resolvePlaceholders } from "./placeholderResolve"
import type { PlaceholderDTO } from "@/api/exercises/versions"
import type { DeployStatus } from "@/api/exercises/deploy"

const status: DeployStatus = {
  Phase: "Ready",
  Ready: true,
  VPNCIDR: "10.128.1.0/24",
  InternetCIDR: "10.9.4.0/24",
  Access: [{ Device: "web", Port: 443, Protocol: "https", URL: "https://web.lab.test" }],
}

describe("resolvePlaceholder", () => {
  it("resolves vpn.subnet with and without mask", () => {
    expect(resolvePlaceholder({ Kind: "vpn.subnet", ShowMask: true }, status)).toBe("10.128.1.0/24")
    expect(resolvePlaceholder({ Kind: "vpn.subnet", ShowMask: false }, status)).toBe("10.128.1.0")
  })

  it("resolves internet.subnet", () => {
    expect(resolvePlaceholder({ Kind: "internet.subnet", ShowMask: true }, status)).toBe("10.9.4.0/24")
  })

  it("resolves a vpn-relative ip by combining the CIDR network with the last octet", () => {
    expect(resolvePlaceholder({ Kind: "ip", IPReference: "vpn", LastOctet: 5, ShowMask: false }, status)).toBe("10.128.1.5")
    expect(resolvePlaceholder({ Kind: "ip", IPReference: "vpn", LastOctet: 5, ShowMask: true }, status)).toBe("10.128.1.5/24")
  })

  it("resolves an internet-relative ip", () => {
    expect(resolvePlaceholder({ Kind: "ip", IPReference: "internet", LastOctet: 12 }, status)).toBe("10.9.4.12")
  })

  it("resolves a static ip straight from the placeholder (no lab data needed)", () => {
    expect(resolvePlaceholder({ Kind: "ip", IPReference: "static", Octets1to3: "192.168.0", LastOctet: 20 }, {
      Phase: "Ready",
      Ready: true,
    })).toBe("192.168.0.20")
  })

  it("resolves external.link to the device's access URL", () => {
    expect(resolvePlaceholder({ Kind: "external.link", DeviceName: "web" }, status)).toBe("https://web.lab.test")
  })

  it("resolves to empty when the lab has no matching data yet", () => {
    const empty: DeployStatus = { Phase: "Provisioning", Ready: false }
    expect(resolvePlaceholder({ Kind: "vpn.subnet" }, empty)).toBe("")
    expect(resolvePlaceholder({ Kind: "ip", IPReference: "vpn", LastOctet: 5 }, empty)).toBe("")
    expect(resolvePlaceholder({ Kind: "external.link", DeviceName: "ghost" }, status)).toBe("")
  })
})

describe("resolvePlaceholder ip link form", () => {
  it("builds scheme://ip[:port][path]", () => {
    expect(resolvePlaceholder({ Kind: "ip", IPReference: "vpn", LastOctet: 5, AsLink: true, Scheme: "http" }, status)).toBe("http://10.128.1.5")
    expect(resolvePlaceholder({ Kind: "ip", IPReference: "internet", LastOctet: 12, AsLink: true, Scheme: "https", Port: 8443, Path: "/admin" }, status)).toBe("https://10.9.4.12:8443/admin")
    expect(resolvePlaceholder({ Kind: "ip", IPReference: "static", Octets1to3: "10.0.0", LastOctet: 7, AsLink: true, Scheme: "http", Path: "/x" }, status)).toBe("http://10.0.0.7/x")
  })

  it("never carries the mask into the link", () => {
    expect(resolvePlaceholder({ Kind: "ip", IPReference: "vpn", LastOctet: 5, ShowMask: true, AsLink: true, Scheme: "http" }, status)).toBe("http://10.128.1.5")
  })

  it("stays empty while the address cannot be resolved", () => {
    const empty: DeployStatus = { Phase: "Provisioning", Ready: false }
    expect(resolvePlaceholder({ Kind: "ip", IPReference: "vpn", LastOctet: 5, AsLink: true, Scheme: "http" }, empty)).toBe("")
  })
})

describe("resolvePlaceholders", () => {
  it("resolves positionally so nodes can map by index", () => {
    const list: PlaceholderDTO[] = [
      { Kind: "vpn.subnet", ShowMask: true },
      { Kind: "external.link", DeviceName: "web" },
    ]
    expect(resolvePlaceholders(list, status)).toEqual(["10.128.1.0/24", "https://web.lab.test"])
  })

  it("handles an undefined list", () => {
    expect(resolvePlaceholders(undefined, status)).toEqual([])
  })
})
