import type { VariantFormValues } from "./exerciseSchemas"

/** Stable object ordering only: authored text and array order are significant. */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, stable(entry)]))
  return value
}

/**
 * What a signature compares besides the content itself (IDs, Index, CopyOf and Weight never count).
 * flags/files: the subtask flags / files; note: the variant note; linked: compare linked variants too (their base counts).
 */
export type SignatureParts = { flags: boolean; files: boolean; note: boolean; linked: boolean }

const ADVISORY: SignatureParts = { flags: false, files: true, note: true, linked: false }

/**
 * A stable content signature of a variant: device and placeholder ids are replaced by their positions, so two
 * variants built the same way compare equal. null when it cannot be compared honestly (a stored secret the
 * client cannot read, a file without an id, a dangling reference).
 */
export function variantSignature(variant: VariantFormValues, parts: SignatureParts = ADVISORY): string | null {
  if (variant.LinkedTo && !parts.linked) return null
  const ids = new Map<string, string>()
  for (const [index, device] of variant.Topology.Devices.entries()) {
    if (!device.ID || ids.has(device.ID)) return null
    if (device.EnvVars.some((env) => env.Secret && !env.Value)) return null
    ids.set(device.ID, `device:${index}`)
  }
  let valid = true
  const deviceRef = (id: string) => {
    if (!id) return ""
    const mapped = ids.get(id)
    if (!mapped) valid = false
    return mapped
  }
  const tasks = variant.Tasks.map((task) => {
    const keys = new Map<string, string>()
    for (const [index, placeholder] of task.Placeholders.entries()) {
      if (!placeholder.Key || keys.has(placeholder.Key)) valid = false
      keys.set(placeholder.Key, `placeholder:${index}`)
    }
    const document = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(document)
      if (!value || typeof value !== "object") return value
      const node = value as Record<string, unknown>
      return Object.fromEntries(Object.entries(node).map(([key, entry]) => {
        if (node.type === "variable" && key === "varName" && typeof entry === "string") {
          const name = keys.get(entry)
          if (!name) valid = false
          return [key, name]
        }
        return [key, document(entry)]
      }))
    }
    if (parts.files && task.Attachments.some((file) => !file.FileID)) valid = false
    return {
      ...task, ID: undefined, Flag: parts.flags ? task.Flag : undefined, Attachments: parts.files ? task.Attachments : undefined,
      LinkedDeviceID: deviceRef(task.LinkedDeviceID),
      Description: document(task.Description),
      Placeholders: task.Placeholders.map((p) => ({ ...p, Key: keys.get(p.Key) })),
      Hints: task.Hints.map((hint) => {
        // Hints may contain the same rich description format, or legacy plain text.
        let text = hint.Text
        try {
          const parsed: unknown = JSON.parse(text)
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "root" in parsed) text = JSON.stringify(stable(document(parsed)))
        } catch { /* Preserve legacy text exactly. */ }
        return { ...hint, ID: undefined, Text: text }
      }),
    }
  })
  const visual = variant.Topology.VisualRender ? { ...variant.Topology.VisualRender } : null
  if (visual) {
    for (const key of ["positions", "labelOffsets", "icons"]) {
      const values = visual[key]
      if (!values || typeof values !== "object" || Array.isArray(values)) continue
      visual[key] = Object.fromEntries(Object.entries(values).map(([id, value]) => [ids.get(id) ?? id, value]))
    }
    const offsets = visual.portLabelOffsets
    if (offsets && typeof offsets === "object" && !Array.isArray(offsets)) {
      visual.portLabelOffsets = Object.fromEntries(Object.entries(offsets).map(([key, value]) => {
        try {
          const pair: unknown = JSON.parse(key)
          if (Array.isArray(pair) && pair.length === 2 && typeof pair[0] === "string" && ids.has(pair[0])) return [JSON.stringify([ids.get(pair[0]), pair[1]]), value]
        } catch { /* Unknown visual metadata remains significant. */ }
        return [key, value]
      }))
    }
  }
  const projected = {
    ...variant, ID: undefined, Index: undefined, CopyOf: undefined, Weight: undefined, Note: parts.note ? variant.Note : undefined, Tasks: tasks,
    Topology: { ...variant.Topology, VisualRender: visual,
      Devices: variant.Topology.Devices.map((device) => ({ ...device, ID: ids.get(device.ID), EnvVars: device.EnvVars.map((env) => ({ ...env, HasValue: undefined })) })),
      Connections: variant.Topology.Connections.map((connection) => ({ ...connection, Endpoints: connection.Endpoints.map((endpoint) => ({ ...endpoint, DeviceID: endpoint.Kind === "device" ? deviceRef(endpoint.DeviceID) : endpoint.DeviceID })) })),
    },
  }
  return valid ? JSON.stringify(stable(projected)) : null
}

/** Advisory only. Never merges records or changes their probability of allocation. */
export function duplicateVariantGroups(variants: VariantFormValues[]): number[][] {
  const groups = new Map<string, number[]>()
  variants.forEach((variant, index) => {
    const key = variantSignature(variant)
    if (key !== null) groups.set(key, [...(groups.get(key) ?? []), index])
  })
  return [...groups.values()].filter((group) => group.length > 1)
}
