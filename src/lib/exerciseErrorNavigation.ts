import type { DraftFormValues } from "@/lib/exerciseSchemas"
import type { EditorPosition } from "@/lib/editorPosition"

export function positionForDraftIssue(
  current: EditorPosition,
  draft: DraftFormValues,
  path: PropertyKey[],
): EditorPosition {
  if (path[0] !== "Variants") return current
  const variant = typeof path[1] === "number" && draft.Variants[path[1]] ? path[1] : 0
  const next: EditorPosition = { ...current, tab: "variants", variant }
  if (path[2] === "Tasks") {
    next.section = "tasks"
    next.task = typeof path[3] === "number" ? path[3] : 0
    return next
  }
  if (path[2] !== "Topology") return next
  next.section = "topology"
  if (path[3] === "Connections") {
    next.topologySection = "connections"
    return next
  }
  if (path[3] !== "Devices" || typeof path[4] !== "number") {
    next.topologySection = path[3] === "VPN" ? "device:vpn" : path[3] === "Internet" ? "device:internet" : "diagram"
    return next
  }
  const device = draft.Variants[variant]?.Topology.Devices[path[4]]
  next.topologySection = device ? `device:${device.ID}` : "diagram"
  if (path[5] === "Interfaces") {
    next.devicePanel = "interfaces"
    next.interface = typeof path[6] === "number" ? path[6] : 0
  } else if (path[5] === "EnvVars") {
    next.devicePanel = "env"
    next.env = typeof path[6] === "number" ? path[6] : 0
  } else if (path[5] === "External") {
    next.devicePanel = "external"
  } else if (path[5] === "ResourcePreset") {
    next.devicePanel = "resources"
  } else {
    next.devicePanel = "basic"
  }
  return next
}
