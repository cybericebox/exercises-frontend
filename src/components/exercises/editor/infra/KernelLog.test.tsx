import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, string | number>) => vars ? `${key} ${Object.values(vars).join(" ")}` : key }))

import { PortsSection } from "./sections/PortsSection"
import { KernelLogAvailableProvider } from "../consoleLines"
import { device, draftWith, FormHarness, readValues, Values } from "./test/harness"
import type { DeviceFormValues, DraftFormValues } from "@/lib/exerciseSchemas"

const port = (Name: string, Mode = "program") => ({ Name, Mode, Command: [], User: "", Port: "" })

function renderPorts(overrides: Partial<DeviceFormValues>, available: boolean | null = null) {
  render(<KernelLogAvailableProvider value={available}><FormHarness draft={draftWith([device({ ID: "r", Name: "router", ...overrides })])} validate>
    <PortsSection variantIndex={0} deviceIndex={0} disabled={false} /><Values path="Variants.0" />
  </FormHarness></KernelLogAvailableProvider>)
}
const saved = () => (readValues() as DraftFormValues["Variants"][number]).Topology.Devices[0]

describe("the kernel log checkbox of the Ports section", () => {
  it("is shown only for a microVM device", () => {
    renderPorts({ Profile: "container", ConsolePorts: [port("console0")] })
    expect(screen.queryByRole("checkbox", { name: /ed.c.port.kernelLog/ })).toBeNull()
  })

  it("switches the flag on and off and names the port that carries the log", () => {
    renderPorts({ Profile: "microvm", ConsolePorts: [port("aux0", "stdio"), port("console0")] })
    const box = screen.getByRole("checkbox", { name: /ed.c.port.kernelLog/ })
    expect(box).toBeEnabled()
    expect(box).not.toBeChecked()
    fireEvent.click(box)
    expect(saved().KernelLog).toBe(true)
    expect(screen.getByText("ed.c.port.kernelLogOn console0")).toBeInTheDocument()
    fireEvent.click(box)
    expect(saved().KernelLog).toBe(false)
  })

  it("is disabled with the reason when the device has no console port that is not native", () => {
    renderPorts({ Profile: "microvm", ConsolePorts: [port("console0", "stdio")] })
    const box = screen.getByRole("checkbox", { name: /ed.c.port.kernelLog/ })
    expect(box).toBeDisabled()
    const note = screen.getByText("ed.c.port.kernelLogNoPort")
    expect(box.getAttribute("aria-describedby")).toContain(note.id)
  })

  it("stays enabled while on, so an author can switch it off, and shows the error beside it", async () => {
    renderPorts({ Profile: "microvm", KernelLog: true, ConsolePorts: [] })
    const box = screen.getByRole("checkbox", { name: /ed.c.port.kernelLog/ })
    expect(box).toBeEnabled()
    fireEvent.click(screen.getByRole("button", { name: "validate-all" }))
    expect(await screen.findByText("ed.c.port.val.kernelLogNoPort")).toBeInTheDocument()
    expect(box).toHaveAttribute("aria-invalid", "true")
  })

  it("says when no laboratory in use shows the kernel log", () => {
    renderPorts({ Profile: "microvm", ConsolePorts: [port("console0")] }, false)
    expect(screen.getByText("ed.c.port.kernelLogUnavailable")).toBeInTheDocument()
  })
})
