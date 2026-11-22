import { describe, expect, it } from "vitest"
import { emptyDevice, emptyDraft } from "@/lib/exerciseSchemas"
import { DEFAULT_EDITOR_POSITION } from "@/lib/editorPosition"
import { BOOTSTRAP_FIELD_SECTION, DEVICE_FIELD_SECTION, deviceSectionOf, positionForDraftIssue } from "./exerciseErrorNavigation"

describe("positionForDraftIssue", () => {
  const draft = emptyDraft()
  const device = emptyDevice()
  device.ID = "device-1"
  device.Name = "web"
  draft.Variants[0].Topology.Devices.push(device)

  it("opens the subtasks of the variant with the invalid field", () => {
    const position = positionForDraftIssue(DEFAULT_EDITOR_POSITION, draft,
      ["Variants", 0, "Tasks", 0, "Name"])
    expect(position).toMatchObject({ tab: "tasks", variant: 0, task: 0 })
  })

  it("opens the condition of a state check that holds the field", () => {
    const position = positionForDraftIssue(DEFAULT_EDITOR_POSITION, draft,
      ["Variants", 0, "Tasks", 1, "Check", "State", "Conditions", 2, "Port", "Port"])
    expect(position).toMatchObject({ tab: "tasks", task: 1, condition: 2 })
  })

  it("opens the all-variants view for the weight of a variant", () => {
    expect(positionForDraftIssue(DEFAULT_EDITOR_POSITION, draft, ["Variants", 0, "Weight"])).toMatchObject({ tab: "variants", variant: 0 })
  })

  it.each([
    [["Variants", 0, "Topology", "Devices", 0, "Name"], { topologySection: "device:device-1", devicePanel: "basic", openNode: "device-1", deviceSection: "main" }],
    [["Variants", 0, "Topology", "Devices", 0, "Interfaces", 1, "IP", "Addresses"], { topologySection: "device:device-1", devicePanel: "interfaces", interface: 1, deviceSection: "network" }],
    [["Variants", 0, "Topology", "Devices", 0, "Bootstrap", "Env", 2, "Name"], { topologySection: "device:device-1", devicePanel: "env", env: 2, deviceSection: "service" }],
    [["Variants", 0, "Topology", "Devices", 0, "Bootstrap", "Files", 1, "Path"], { openNode: "device-1", deviceSection: "init" }],
    [["Variants", 0, "Topology", "Devices", 0, "Bootstrap", "Script"], { openNode: "device-1", deviceSection: "init" }],
    [["Variants", 0, "Topology", "Devices", 0, "Command"], { openNode: "device-1", deviceSection: "service" }],
    [["Variants", 0, "Topology", "Devices", 0, "Access", 0, "Port"], { topologySection: "device:device-1", devicePanel: "external", deviceSection: "access" }],
    [["Variants", 0, "Topology", "Devices", 0, "ResourcePreset"], { topologySection: "device:device-1", devicePanel: "resources" }],
    [["Variants", 0, "Topology", "Connections", 0], { topologySection: "connections", infraView: "connections" }],
    [["Variants", 0, "Topology", "Variables", 1, "Name"], { infraView: "vars" }],
    // A gateway is a device: its fields open its small dialog by the device id.
    [["Variants", 0, "Topology", "Devices", 0, "DHCPRanges"], { openNode: "device-1", deviceSection: "main" }],
    [["Variants", 0, "Topology", "Devices", 0, "ReverseConnections"], { topologySection: "device:device-1", deviceSection: "main" }],
  ] as const)("opens the owning part of the infrastructure for %j", (path, expected) => {
    const position = positionForDraftIssue(DEFAULT_EDITOR_POSITION, draft, [...path])
    expect(position).toMatchObject({ tab: "infrastructure", variant: 0, ...expected })
  })
})

describe("device field to section table", () => {
  it("places every field of the device form model and of its bootstrap in a real section", () => {
    const sections = ["main", "network", "init", "service", "access"]
    const device = emptyDevice()
    for (const key of Object.keys(device)) expect(sections, key).toContain(DEVICE_FIELD_SECTION[key as keyof typeof device])
    for (const key of Object.keys(device.Bootstrap)) expect(sections, key).toContain(BOOTSTRAP_FIELD_SECTION[key as keyof typeof device.Bootstrap])
  })

  it("lands every device field in the section its dialog shows it in", () => {
    const expected: [string, string][] = [
      ["Name", "main"], ["Image", "main"], ["Profile", "main"], ["ResourcePreset", "main"], ["SecurityPreset", "main"], ["Type", "main"],
      ["Interfaces", "network"], ["Access", "access"], ["Command", "service"], ["Args", "service"], ["Persistence", "service"], ["WaitReadyFile", "service"],
    ]
    for (const [field, section] of expected) expect(deviceSectionOf(field), field).toBe(section)
    for (const [field, section] of [["Env", "service"], ["Files", "init"], ["Script", "init"], ["Interpreter", "init"], ["Timeout", "init"]] as const) expect(deviceSectionOf("Bootstrap", field), field).toBe(section)
    expect(deviceSectionOf("Unknown")).toBe("main")
  })
})
