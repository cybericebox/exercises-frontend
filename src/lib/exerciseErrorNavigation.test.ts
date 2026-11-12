import { describe, expect, it } from "vitest"
import { emptyDevice, emptyDraft } from "@/lib/exerciseSchemas"
import { DEFAULT_EDITOR_POSITION } from "@/lib/editorPosition"
import { positionForDraftIssue } from "./exerciseErrorNavigation"

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
    [["Variants", 0, "Topology", "VPN"], { topologySection: "device:vpn", openNode: "vpn" }],
  ] as const)("opens the owning part of the infrastructure for %j", (path, expected) => {
    const position = positionForDraftIssue(DEFAULT_EDITOR_POSITION, draft, [...path])
    expect(position).toMatchObject({ tab: "infrastructure", variant: 0, ...expected })
  })
})
