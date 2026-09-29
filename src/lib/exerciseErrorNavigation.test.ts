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

  it("opens the selected variant and task with the invalid field", () => {
    const position = positionForDraftIssue(DEFAULT_EDITOR_POSITION, draft,
      ["Variants", 0, "Tasks", 0, "Name"])
    expect(position).toMatchObject({ tab: "variants", variant: 0, section: "tasks", task: 0 })
  })

  it.each([
    [["Variants", 0, "Topology", "Devices", 0, "Name"], { topologySection: "device:device-1", devicePanel: "basic" }],
    [["Variants", 0, "Topology", "Devices", 0, "Interfaces", 1, "IP", "Addresses"], { topologySection: "device:device-1", devicePanel: "interfaces", interface: 1 }],
    [["Variants", 0, "Topology", "Devices", 0, "EnvVars", 2, "Name"], { topologySection: "device:device-1", devicePanel: "env", env: 2 }],
    [["Variants", 0, "Topology", "Devices", 0, "External", "Port"], { topologySection: "device:device-1", devicePanel: "external" }],
    [["Variants", 0, "Topology", "Devices", 0, "Resources", "CPURequest"], { topologySection: "device:device-1", devicePanel: "resources" }],
    [["Variants", 0, "Topology", "Connections", 0], { topologySection: "connections" }],
    [["Variants", 0, "Topology", "VPN"], { topologySection: "device:vpn" }],
  ] as const)("opens the owning topology section for %j", (path, expected) => {
    const position = positionForDraftIssue(DEFAULT_EDITOR_POSITION, draft, [...path])
    expect(position).toMatchObject({ tab: "variants", section: "topology", variant: 0, ...expected })
  })
})
