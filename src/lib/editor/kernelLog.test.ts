import { describe, expect, it, vi } from "vitest"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, unknown>) => vars ? `${key}${JSON.stringify(vars)}` : key }))

import { normalizeTopology, type TopologyDTO } from "@/api/exercises/versions"
import { draftSchema, emptyDevice, emptyDraft, emptyTask, topologyToDTO, topologyToForm, type DeviceFormValues, type DraftFormValues } from "@/lib/exerciseSchemas"
import { DEVICE_FIELD_SECTION } from "@/lib/exerciseErrorNavigation"
import { kernelLogPort } from "./consolePorts"
import { deviceFieldPath } from "./serverFieldPath"

const port = (Name: string, Mode = "program") => ({ Name, Mode, Command: [], User: "", Port: Mode === "tcp" ? "2001" : "" })

function draft(device: Partial<DeviceFormValues>): DraftFormValues {
  const value = emptyDraft()
  value.Variants[0].Tasks = [{ ...emptyTask("scan"), Key: "scan", Name: "Scan" }]
  value.Variants[0].Topology.Devices = [{ ...emptyDevice(), ID: "d0", Name: "r1", ...device }]
  return value
}
const issues = (value: DraftFormValues) => {
  const result = draftSchema.safeParse(value)
  return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
}

describe("the kernel log of a microVM device", () => {
  it("goes on the first console port that is not native, in declared order", () => {
    expect(kernelLogPort({ Profile: "microvm", KernelLog: true, ConsolePorts: [port("aux0", "stdio"), port("console0"), port("console1")] })).toBe("console0")
    expect(kernelLogPort({ Profile: "microvm", KernelLog: true, ConsolePorts: [port("aux0", "tcp")] })).toBe("")
    expect(kernelLogPort({ Profile: "microvm", KernelLog: false, ConsolePorts: [port("console0")] })).toBe("")
    expect(kernelLogPort({ Profile: "container", KernelLog: true, ConsolePorts: [port("console0")] })).toBe("")
  })

  it("needs a microVM and a console port that is not native, said beside the field", () => {
    expect(issues(draft({ Profile: "microvm", KernelLog: true, ConsolePorts: [port("console0")] }))).toEqual([])
    expect(issues(draft({ Profile: "microvm", KernelLog: true, ConsolePorts: [port("console0", "stdio")] })))
      .toContain("Variants.0.Topology.Devices.0.KernelLog: ed.c.port.val.kernelLogNoPort")
    expect(issues(draft({ Profile: "microvm", KernelLog: true, ConsolePorts: [] })))
      .toContain("Variants.0.Topology.Devices.0.KernelLog: ed.c.port.val.kernelLogNoPort")
    expect(issues(draft({ Profile: "container", KernelLog: true, ConsolePorts: [port("console0")] })))
      .toContain("Variants.0.Topology.Devices.0.KernelLog: ed.c.port.val.kernelLogProfile")
  })

  it("survives a save: wire -> form -> wire keeps it, and a flag no port can carry is still saved (its error shows)", () => {
    const wire: TopologyDTO = { Devices: [
      { ID: "a", Name: "r1", Type: "node", Profile: "microvm", ConsolePorts: [{ Name: "console0" }], KernelLog: true },
      { ID: "b", Name: "r2", Type: "node", Profile: "microvm", ConsolePorts: [{ Name: "console0" }] },
    ] }
    const form = topologyToForm(normalizeTopology(wire))
    expect(form.Devices[0].KernelLog).toBe(true)
    expect(form.Devices[1].KernelLog).toBe(false)
    const out = topologyToDTO(form).Devices ?? []
    expect(out[0].KernelLog).toBe(true)
    expect(out[1]).not.toHaveProperty("KernelLog")

    // The flag is the author's: a profile or port change never drops it; the error stays until the author fixes it.
    form.Devices[0].ConsolePorts = []
    expect(topologyToDTO(form).Devices?.[0]?.KernelLog).toBe(true)
    form.Devices[0].Profile = "container"
    expect(topologyToDTO(form).Devices?.[0]?.KernelLog).toBe(true)
    const withForm = draft({})
    withForm.Variants[0].Topology.Devices = [form.Devices[0]]
    expect(issues(withForm)).toContain("Variants.0.Topology.Devices.0.KernelLog: ed.c.port.val.kernelLogProfile")
  })

  it("a server error on kernel_log sits at the checkbox in the Ports section", () => {
    expect(deviceFieldPath("kernel_log")).toEqual(["KernelLog"])
    expect(DEVICE_FIELD_SECTION.KernelLog).toBe("ports")
  })
})
