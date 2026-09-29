import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))

import { emptyDevice, emptyVariant } from "@/lib/exerciseSchemas"
import { TopologyDeviceOverview } from "./TopologyDeviceOverview"

describe("TopologyDeviceOverview", () => {
  it("shows a compact device table and keeps open and remove actions separate", () => {
    const topology = emptyVariant(0).Topology
    const device = emptyDevice()
    device.ID = "host-id"
    device.Name = "a-very-long-host-name-that-should-not-expand-the-page"
    device.External.Enabled = true
    topology.Devices = [device]
    topology.VPN.Enabled = true
    const onOpen = vi.fn()
    const onRemove = vi.fn()
    render(<TopologyDeviceOverview topology={topology} disabled={false} selectedKey={null} onOpen={onOpen} onRemove={onRemove} />)

    const table = screen.getByRole("table", { name: "admin.exTopo.devices" })
    expect(table.parentElement).toHaveClass("overflow-x-auto")
    const host = within(table).getByRole("row", { name: /a-very-long-host-name/ })
    expect(within(host).getByText("0 / 1")).toBeInTheDocument()
    expect(within(host).getByText("1")).toBeInTheDocument()
    expect(within(host).getByText("admin.exTopo.overview.yes")).toBeInTheDocument()
    fireEvent.click(within(host).getByRole("button", { name: device.Name }))
    expect(onOpen).toHaveBeenCalledWith("host-id")
    fireEvent.click(within(host).getByRole("button", { name: "admin.exTopo.removeDevice" }))
    expect(onRemove).toHaveBeenCalledWith("host-id")
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(host).toHaveClass("group")
    expect(within(host).getByRole("button", { name: "admin.exTopo.removeDevice" }).parentElement?.parentElement)
      .toHaveClass("opacity-0", "group-hover:opacity-100", "group-focus-within:opacity-100")
    fireEvent.click(within(host).getByRole("button", { name: "admin.exTopo.configure" }))
    expect(onOpen).toHaveBeenCalledTimes(2)

    const gateway = within(table).getByRole("row", { name: /admin.exTopo.vpn/ })
    expect(within(gateway).getByText("—")).toBeInTheDocument()
  })

  it("keeps only the settings action when the editor is read-only", () => {
    const topology = emptyVariant(0).Topology
    const device = emptyDevice()
    device.ID = "host-id"
    device.Name = "web"
    topology.Devices = [device]
    const onOpen = vi.fn()
    render(<TopologyDeviceOverview topology={topology} disabled selectedKey={null} onOpen={onOpen} onRemove={vi.fn()} />)
    const row = screen.getByRole("row", { name: /web/ })
    expect(within(row).queryByRole("button", { name: "admin.exTopo.removeDevice" })).not.toBeInTheDocument()
    fireEvent.click(within(row).getByRole("button", { name: "admin.exTopo.configure" }))
    expect(onOpen).toHaveBeenCalledWith("host-id")
  })
})
