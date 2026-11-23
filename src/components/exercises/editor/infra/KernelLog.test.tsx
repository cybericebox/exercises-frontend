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
const control = () => screen.getByRole("switch", { name: "ed.c.port.kernelLog" })

describe("the kernel log switch of the Ports section", () => {
  it("is shown only for a microVM device while it is off", () => {
    renderPorts({ Profile: "container", ConsolePorts: [port("console0")] })
    expect(screen.queryByRole("switch", { name: "ed.c.port.kernelLog" })).toBeNull()
  })

  it("switches the flag on and off and names the port that carries the log", () => {
    renderPorts({ Profile: "microvm", ConsolePorts: [port("aux0", "stdio"), port("console0")] })
    expect(control()).toBeEnabled()
    expect(control()).toHaveAttribute("aria-checked", "false")
    fireEvent.click(control())
    expect(saved().KernelLog).toBe(true)
    const note = screen.getByText("ed.c.port.kernelLogOn console0")
    expect(control().getAttribute("aria-describedby")).toContain(note.id)
    fireEvent.click(control())
    expect(saved().KernelLog).toBe(false)
  })

  it("is disabled with the reason, tied to it, when the device has no console port that is not native", () => {
    renderPorts({ Profile: "microvm", ConsolePorts: [port("console0", "stdio")] })
    expect(control()).toBeDisabled()
    const note = screen.getByText("ed.c.port.kernelLogNoPort")
    expect(note.id).not.toBe("")
    expect(control().getAttribute("aria-describedby")).toContain(note.id)
  })

  it("stays visible and enabled while on but invalid, with the error beside it, so it can be switched off", async () => {
    renderPorts({ Profile: "microvm", KernelLog: true, ConsolePorts: [] })
    expect(control()).toBeEnabled()
    fireEvent.click(screen.getByRole("button", { name: "validate-all" }))
    const error = await screen.findByText("ed.c.port.val.kernelLogNoPort")
    expect(control()).toHaveAttribute("aria-invalid", "true")
    expect(control().getAttribute("aria-describedby")).toContain(error.closest("p")!.id)
    fireEvent.click(control())
    expect(saved().KernelLog).toBe(false)
  })

  it("stays visible on a device that is no longer a microVM while the flag is on", async () => {
    renderPorts({ Profile: "container", KernelLog: true, ConsolePorts: [port("console0")] })
    expect(control()).toBeEnabled()
    fireEvent.click(screen.getByRole("button", { name: "validate-all" }))
    expect(await screen.findByText("ed.c.port.val.kernelLogProfile")).toBeInTheDocument()
  })

  it("says when no laboratory in use shows the kernel log", () => {
    renderPorts({ Profile: "microvm", ConsolePorts: [port("console0")] }, false)
    expect(screen.getByText("ed.c.port.kernelLogUnavailable")).toBeInTheDocument()
  })
})
