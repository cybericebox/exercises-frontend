import type { DraftFormValues } from "@/lib/exerciseSchemas"
import type { DeviceSection, EditorPosition } from "@/lib/editorPosition"
import type { BootstrapFormValues, DeviceFormValues } from "@/lib/editor/schemas/infra"

/**
 * Where the editor must be to show the field at a form path (`Variants.2.Tasks.1.Check.State.Conditions.0.Port.Port`):
 * the tab, the variant, the task, the infrastructure sub-view and the device dialog section. Used by the publish check,
 * the issues dialog («Перейти») and the server errors that carry a `field`.
 */
/**
 * Which section of the device dialog holds each field of the device form model. `Record<keyof …>` makes a new field a
 * compile error until it is placed here (and the table test checks the sections are real).
 */
export const DEVICE_FIELD_SECTION: Record<keyof DeviceFormValues, DeviceSection> = {
  ID: "main", Name: "main", Type: "main", Profile: "main", SecurityPreset: "main", Image: "main", ResourcePreset: "main", System: "main", Hardware: "main",
  Interfaces: "network",
  Bootstrap: "init",
  Command: "service", Args: "service", Persistence: "service", WaitReadyFile: "service",
  Access: "access",
  // A gateway has one small dialog: every field of it is in the first section.
  DHCP: "main", DHCPRanges: "main", DNS: "main", ReverseConnections: "main",
}

/** Environment variables are in «Сервіс»; files, the script, its interpreter and the timeout are in «Ініціалізація». */
export const BOOTSTRAP_FIELD_SECTION: Record<keyof BootstrapFormValues, DeviceSection> = {
  Env: "service", Files: "init", Script: "init", Interpreter: "init", Timeout: "init",
}

export function deviceSectionOf(field: unknown, subfield?: unknown): DeviceSection {
  if (field === "Bootstrap") return BOOTSTRAP_FIELD_SECTION[subfield as keyof BootstrapFormValues] ?? DEVICE_FIELD_SECTION.Bootstrap
  return DEVICE_FIELD_SECTION[field as keyof DeviceFormValues] ?? "main"
}

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
    next.topologySection = "diagram"
    next.infraView = "diagram"
    next.openNode = ""
    return next
  }
  const device = draft.Variants[variant]?.Topology.Devices[path[4]]
  next.topologySection = device ? `device:${device.ID}` : "diagram"
  next.infraView = "diagram"
  next.openNode = device?.ID ?? ""
  const section = deviceSectionOf(path[5], path[6])
  if (path[5] === "Interfaces") {
    next.devicePanel = "interfaces"
    next.interface = typeof path[6] === "number" ? path[6] : 0
  } else if (path[5] === "Bootstrap") {
    next.devicePanel = "env"
    next.env = path[6] === "Env" && typeof path[7] === "number" ? path[7] : 0
  } else if (path[5] === "Command" || path[5] === "Args") {
    next.devicePanel = "basic"
  } else if (path[5] === "Access") {
    next.devicePanel = "external"
  } else if (path[5] === "ResourcePreset") {
    next.devicePanel = "resources"
  } else {
    next.devicePanel = "basic"
  }
  next.deviceSection = section
  return next
}
