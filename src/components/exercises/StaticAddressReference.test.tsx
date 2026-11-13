import { useState } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { NetworkIPRefDTO } from "@/api/exercises/versions"
import { addressReferenceOverlapsDHCP, StaticAddressReference, type GatewaySource } from "./StaticAddressReference"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, string | number>) => vars ? `${key} ${Object.values(vars).join(" ")}` : key }))

const attack: GatewaySource = { Name: "attack", DHCP: false }
const out: GatewaySource = { Name: "out", DHCP: false }

describe("StaticAddressReference", () => {
  it("selects a gateway by name, edits its host number, and returns to manual entry", () => {
    function Harness() {
      const [reference, setReference] = useState<NetworkIPRefDTO | null>(null)
      return <StaticAddressReference kind="address" reference={reference} onChange={setReference} gateways={[attack, out]} />
    }
    render(<Harness />)
    fireEvent.keyDown(screen.getByRole("button", { name: "admin.exTopo.ref.choice.address" }), { key: "ArrowDown" })
    expect(screen.getByRole("menuitemradio", { name: /ed.c.ref.fromGateway out/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("menuitemradio", { name: /ed.c.ref.fromGateway attack/ }))
    expect(screen.getByRole("spinbutton", { name: "admin.exTopo.ref.host" })).toHaveValue(10)
    fireEvent.change(screen.getByRole("spinbutton", { name: "admin.exTopo.ref.host" }), { target: { value: "25" } })
    expect(screen.getByRole("spinbutton", { name: "admin.exTopo.ref.host" })).toHaveValue(25)
    expect(screen.getByRole("button", { name: "admin.exTopo.ref.choice.address" })).toHaveTextContent("ed.c.ref.fromGateway attack")
    expect(screen.getByText("/24")).toHaveClass("text-sm", "font-normal", "text-foreground")
    expect(screen.getByRole("spinbutton", { name: "admin.exTopo.ref.host" }).parentElement?.parentElement).toHaveClass("grid-cols-[minmax(0,1fr)_auto]")
    fireEvent.keyDown(screen.getByRole("button", { name: "admin.exTopo.ref.choice.address" }), { key: "ArrowDown" })
    fireEvent.click(screen.getByRole("menuitemradio", { name: /admin.exTopo.ref.manual/ }))
    expect(screen.queryByRole("spinbutton", { name: "admin.exTopo.ref.host" })).not.toBeInTheDocument()
  })

  it("offers a destination by gateway name only (no host number)", () => {
    const changes: unknown[] = []
    render(<StaticAddressReference kind="destination" reference={null} onChange={(reference) => changes.push(reference)} gateways={[attack, out]} />)
    fireEvent.keyDown(screen.getByRole("button", { name: "admin.exTopo.ref.choice.destination" }), { key: "ArrowDown" })
    fireEvent.click(screen.getByRole("menuitemradio", { name: /ed.c.ref.fromGateway out/ }))
    expect(changes).toEqual([{ Gateway: "out" }])
  })

  it("with no gateway in the lab only «manual» can be chosen and the other entry says why", () => {
    render(<StaticAddressReference kind="gateway" reference={null} onChange={() => {}} gateways={[]} />)
    fireEvent.keyDown(screen.getByRole("button", { name: "admin.exTopo.ref.choice.gateway" }), { key: "ArrowDown" })
    const none = screen.getByRole("menuitemradio", { name: /ed.c.ref.fromGatewayNone/ })
    expect(none).toHaveAttribute("data-disabled")
    expect(none).toHaveTextContent("ed.c.ref.noGateways")
  })

  it("keeps a reference to a gateway that is gone in the list, marked and disabled", () => {
    render(<StaticAddressReference kind="address" reference={{ Gateway: "old", Host: 10 }} onChange={() => {}} gateways={[attack]} />)
    expect(screen.getByRole("button", { name: "admin.exTopo.ref.choice.address" })).toHaveTextContent("ed.c.ref.fromGateway old")
    fireEvent.keyDown(screen.getByRole("button", { name: "admin.exTopo.ref.choice.address" }), { key: "ArrowDown" })
    expect(screen.getByRole("menuitemradio", { name: /ed.c.ref.fromGateway old/ })).toHaveTextContent("ed.c.ref.gatewayGone")
  })

  it("allows an address with DHCP on; overlap is a non-blocking warning for the containing form", () => {
    const dhcp: GatewaySource = { Name: "attack", DHCP: true, DHCPRanges: [{ Start: 2, End: 20 }] }
    function Harness() {
      const [reference, setReference] = useState<NetworkIPRefDTO | null>(null)
      return <StaticAddressReference kind="address" reference={reference} onChange={setReference} gateways={[dhcp, out]} />
    }
    render(<Harness />)
    fireEvent.keyDown(screen.getByRole("button", { name: "admin.exTopo.ref.choice.address" }), { key: "ArrowDown" })
    const item = screen.getByRole("menuitemradio", { name: /ed.c.ref.fromGateway attack/ })
    expect(item).not.toHaveAttribute("data-disabled")
    fireEvent.click(item)
    expect(addressReferenceOverlapsDHCP({ Gateway: "attack", Host: 10 }, [dhcp])).toBe(true)
    fireEvent.change(screen.getByRole("spinbutton", { name: "admin.exTopo.ref.host" }), { target: { value: "25" } })
    expect(addressReferenceOverlapsDHCP({ Gateway: "attack", Host: 25 }, [dhcp])).toBe(false)
    expect(addressReferenceOverlapsDHCP({ Gateway: "attack", Host: 10 }, [{ ...dhcp, DHCPRanges: [] }])).toBe(false)
    expect(addressReferenceOverlapsDHCP({ Gateway: "gone", Host: 10 }, [dhcp])).toBe(false)
  })
})
