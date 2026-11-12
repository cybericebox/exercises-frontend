import { findRefs } from "@/lib/editor/refs"
import type { TaskFormValues } from "@/lib/editor/schemas/task"
import type { TopologyFormValues } from "@/lib/editor/schemas/infra"
import type { DeviceSection } from "@/lib/editorPosition"

/** One place where a variable of the schema is used; the chip opens exactly that row. */
export type VariableUse =
  | { kind: "device"; deviceId: string; deviceName: string; section: DeviceSection; what: { key: "env" | "file" | "script"; name: string }; field: string[] }
  | { kind: "condition"; taskIndex: number; taskName: string; conditionIndex: number }

const uses = (text: string, name: string) => findRefs(text).some((ref) => ref.kind === "var" && ref.name === name)

/** Every place of a variant that refers to `{{var.<name>}}`: environment values, file contents, scripts, conditions. */
export function variableUsage(variantIndex: number, topology: Pick<TopologyFormValues, "Devices">, tasks: Pick<TaskFormValues, "Name" | "Check">[], name: string): VariableUse[] {
  if (!name) return []
  const out: VariableUse[] = []
  topology.Devices.forEach((device, deviceIndex) => {
    if (device.Type !== "node") return
    const root = ["Variants", String(variantIndex), "Topology", "Devices", String(deviceIndex), "Bootstrap"]
    const base = { kind: "device" as const, deviceId: device.ID, deviceName: device.Name }
    device.Bootstrap.Env.forEach((variable, index) => {
      if (uses(variable.Value, name)) out.push({ ...base, section: "service", what: { key: "env", name: variable.Name }, field: [...root, "Env", String(index), "Value"] })
    })
    device.Bootstrap.Files.forEach((file, index) => {
      if (uses(file.Content, name)) out.push({ ...base, section: "init", what: { key: "file", name: file.Path }, field: [...root, "Files", String(index), "Content"] })
    })
    if (uses(device.Bootstrap.Script, name)) out.push({ ...base, section: "init", what: { key: "script", name: "" }, field: [...root, "Script"] })
  })
  tasks.forEach((task, taskIndex) => {
    if (task.Check?.Kind !== "state") return
    task.Check.State.Conditions.forEach((condition, conditionIndex) => {
      if (uses(JSON.stringify(condition), name)) out.push({ kind: "condition", taskIndex, taskName: task.Name, conditionIndex })
    })
  })
  return out
}
