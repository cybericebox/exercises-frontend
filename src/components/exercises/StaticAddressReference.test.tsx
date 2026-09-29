import { useState } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { NetworkIPRefDTO } from "@/api/exercises/versions"
import { addressReferenceOverlapsDHCP, StaticAddressReference } from "./StaticAddressReference"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))

describe("StaticAddressReference", () => {
  it("selects a VPN host, edits its last octet, and returns to manual entry", () => {
    function Harness() {
      const [reference, setReference] = useState<NetworkIPRefDTO | null>(null)
      return <StaticAddressReference kind="address" reference={reference} onChange={setReference}
        vpn={{ Enabled: true, DHCP: false }} internet={{ Enabled: true, DHCP: false }} />
    }
    render(<Harness />)
    fireEvent.keyDown(screen.getByRole("button", { name: "admin.exTopo.ref.choice.address" }), { key: "ArrowDown" })
    fireEvent.click(screen.getByRole("menuitemradio", { name: /admin.exTopo.ref.vpn/ }))
    expect(screen.getByRole("spinbutton", { name: "admin.exTopo.ref.host" })).toHaveValue(10)
    fireEvent.change(screen.getByRole("spinbutton", { name: "admin.exTopo.ref.host" }), { target: { value: "25" } })
    expect(screen.getByRole("spinbutton", { name: "admin.exTopo.ref.host" })).toHaveValue(25)
    expect(screen.getByRole("button", { name: "admin.exTopo.ref.choice.address" })).toHaveTextContent("admin.exTopo.ref.vpn")
    expect(screen.getByText("/24")).toHaveClass("text-sm", "font-normal", "text-foreground")
    expect(screen.getByRole("spinbutton", { name: "admin.exTopo.ref.host" }).parentElement?.parentElement).toHaveClass("grid-cols-[minmax(0,1fr)_auto]")
    fireEvent.keyDown(screen.getByRole("button", { name: "admin.exTopo.ref.choice.address" }), { key: "ArrowDown" })
    fireEvent.click(screen.getByRole("menuitemradio", { name: /admin.exTopo.ref.manual/ }))
    expect(screen.queryByRole("spinbutton", { name: "admin.exTopo.ref.host" })).not.toBeInTheDocument()
  })

  it("allows an address with DHCP on; overlap is a non-blocking warning for the containing form", () => {
    function Harness() {
      const [reference, setReference] = useState<NetworkIPRefDTO | null>(null)
      return <StaticAddressReference kind="address" reference={reference} onChange={setReference}
        vpn={{ Enabled: true, DHCP: true, DHCPRanges: [{ Start: 2, End: 20 }] }} internet={{ Enabled: false, DHCP: false }} />
    }
    render(<Harness />)
    fireEvent.keyDown(screen.getByRole("button", { name: "admin.exTopo.ref.choice.address" }), { key: "ArrowDown" })
    const vpn = screen.getByRole("menuitemradio", { name: /admin.exTopo.ref.vpn/ })
    expect(vpn).not.toHaveAttribute("data-disabled")
    fireEvent.click(vpn)
    expect(screen.queryByText("admin.exTopo.ref.assignedOnStart")).not.toBeInTheDocument()
    expect(addressReferenceOverlapsDHCP({ Network: "vpn", Host: 10 }, { Enabled: true, DHCP: true, DHCPRanges: [{ Start: 2, End: 20 }] })).toBe(true)
    fireEvent.change(screen.getByRole("spinbutton", { name: "admin.exTopo.ref.host" }), { target: { value: "25" } })
    expect(addressReferenceOverlapsDHCP({ Network: "vpn", Host: 25 }, { Enabled: true, DHCP: true, DHCPRanges: [{ Start: 2, End: 20 }] })).toBe(false)
    expect(addressReferenceOverlapsDHCP({ Network: "vpn", Host: 10 }, { Enabled: true, DHCP: true, DHCPRanges: [] })).toBe(false)
    fireEvent.keyDown(screen.getByRole("button", { name: "admin.exTopo.ref.choice.address" }), { key: "ArrowDown" })
    expect(screen.getByRole("menuitemradio", { name: /admin.exTopo.ref.internet/ })).toHaveTextContent("admin.exTopo.ref.networkDisabled")
  })
})
