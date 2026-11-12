import type { DraftFormValues } from "@/lib/exerciseSchemas"
import type { DeviceSection, EditorPosition } from "@/lib/editorPosition"

/**
 * Where the editor must be to show the field at a form path (`Variants.2.Tasks.1.Check.State.Conditions.0.Port.Port`):
 * the tab, the variant, the task, the infrastructure sub-view and the device dialog section. Used by the publish check,
 * the issues dialog («Перейти») and the server errors that carry a `field`.
 */
export function positionForDraftIssue(
  current: EditorPosition,
  draft: DraftFormValues,
  path: PropertyKey[],
): EditorPosition {
  if (path[0] !== "Variants") return current
  const variant = typeof path[1] === "number" && draft.Variants[path[1]] ? path[1] : 0
  if (path[2] === undefined || path[2] === "Weight" || path[2] === "LinkedTo" || path[2] === "ImageOverrides" || path[2] === "Note") {
    return { ...current, tab: "variants", variant }
  }
  const next: EditorPosition = { ...current, tab: "tasks", variant }
  if (path[2] === "Tasks") {
    next.task = typeof path[3] === "number" ? path[3] : 0
    // Conditions of a state check are collapsed lists: the one with the error opens.
    if (path[4] === "Check" && path[5] === "State" && path[6] === "Conditions" && typeof path[7] === "number") next.condition = path[7]
    return next
  }
  if (path[2] !== "Topology") return next
  next.tab = "infrastructure"
  if (path[3] === "Variables") {
    next.infraView = "vars"
    return next
  }
  if (path[3] === "Connections") {
    next.infraView = "connections"
    next.topologySection = "connections"
    return next
  }
  if (path[3] !== "Devices" || typeof path[4] !== "number") {
    const node = path[3] === "VPN" ? "vpn" : path[3] === "Internet" ? "internet" : ""
    next.topologySection = node ? `device:${node}` : "diagram"
    next.infraView = "diagram"
    next.openNode = node
    return next
  }
  const device = draft.Variants[variant]?.Topology.Devices[path[4]]
  next.topologySection = device ? `device:${device.ID}` : "diagram"
  next.infraView = "diagram"
  next.openNode = device?.ID ?? ""
  let section: DeviceSection = "main"
  if (path[5] === "Interfaces") {
    section = "network"
    next.devicePanel = "interfaces"
    next.interface = typeof path[6] === "number" ? path[6] : 0
  } else if (path[5] === "Bootstrap") {
    // Environment variables are in «Сервіс»; files, the script, its interpreter and the timeout are in «Ініціалізація».
    section = path[6] === "Env" ? "service" : "init"
    next.devicePanel = "env"
    next.env = path[6] === "Env" && typeof path[7] === "number" ? path[7] : 0
  } else if (path[5] === "Command" || path[5] === "Args") {
    section = "service"
    next.devicePanel = "basic"
  } else if (path[5] === "Access") {
    section = "access"
    next.devicePanel = "external"
  } else if (path[5] === "ResourcePreset") {
    next.devicePanel = "resources"
  } else {
    next.devicePanel = "basic"
  }
  next.deviceSection = section
  return next
}
