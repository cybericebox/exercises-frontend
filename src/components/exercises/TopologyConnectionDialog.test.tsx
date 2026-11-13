import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, string | number>) => vars ? `${key} ${Object.values(vars).join(" ")}` : key }))

import { TopologyConnectionDialog } from "./TopologyConnectionDialog"
import { device, draftWith, FormHarness, gatewayDevice } from "./editor/infra/test/harness"

const sw = () => device({ ID: "sw", Name: "sw1", Type: "unmanaged-switch", Interfaces: [] })

function renderDialog(pair: [string, string], onAdd = vi.fn()) {
  const draft = draftWith([sw(), device({ ID: "d1", Name: "web", Interfaces: [{ Name: "eth0", MAC: "", IP: { Type: "dhcp", Addresses: [], AddressRef: null, Gateway: "", GatewayRef: null, Routes: [] } }] }),
    gatewayDevice("vpn", "a", "g1"), gatewayDevice("vpn", "b", "g2")], {
    Connections: [{ Endpoints: [{ Kind: "device", DeviceID: "g1", Interface: "eth0" }, { Kind: "device", DeviceID: "sw", Interface: "GigabitEthernet0/1" }] }],
  })
  render(<FormHarness draft={draft}><TopologyConnectionDialog variantIndex={0} pair={pair} onAdd={onAdd} onClose={() => {}} /></FormHarness>)
  return onAdd
}

describe("connecting on the canvas", () => {
  it("connects a free gateway port like any device port, as a device endpoint", () => {
    const onAdd = renderDialog(["g2", "d1"])
    fireEvent.click(screen.getByRole("button", { name: "admin.exTopo.canvasConnect" }))
    expect(onAdd).toHaveBeenCalledWith({ Kind: "device", DeviceID: "g2", Interface: "eth0" }, { Kind: "device", DeviceID: "d1", Interface: "eth0" })
  })

  it("refuses a link that would put a second gateway into one network, with the reason", () => {
    const onAdd = renderDialog(["g2", "sw"])
    expect(screen.getByRole("alert")).toHaveTextContent("ed.c.gw.networkTaken a")
    // The reason is tied to both port selects, which are marked invalid.
    for (const name of ["admin.exTopo.endpoint.first", "admin.exTopo.endpoint.second"]) {
      const select = screen.getByRole("button", { name })
      expect(select).toHaveAttribute("aria-invalid", "true")
      expect((select.getAttribute("aria-describedby") ?? "").split(" ")).toContain(screen.getByRole("alert").id)
    }
    expect(screen.getByRole("button", { name: "admin.exTopo.canvasConnect" })).toBeDisabled()
    expect(onAdd).not.toHaveBeenCalled()
  })

  it("offers no port of a gateway whose port is taken", () => {
    renderDialog(["g1", "d1"])
    expect(screen.getByText("admin.exTopo.noFreePort")).toBeInTheDocument()
  })
})
