import { findRefs } from "@/lib/editor/refs"
import type { TopologyFormValues } from "@/lib/editor/schemas/infra"
import type { DeviceSection } from "@/lib/editorPosition"

/**
 * A place where the answer of a task reaches a device, with what the editor needs to open it: the form path of the exact
 * row (variable value, file content, script) and the section of the device dialog that holds it. A variable is edited in
 * «Сервіс»; a file and the script in «Ініціалізація».
 */
export type DeliveryPlace = {
  kind: "env" | "file" | "script"
  deviceId: string
  deviceName: string
  /** Name of the variable / path of the file; "" for the script and for an unnamed row. */
  label: string
  /** Row in `Bootstrap.Env` / `Bootstrap.Files`; -1 for the script. */
  row: number
  section: DeviceSection
  /** Form path of the control, relative to the variant: `Topology.Devices.2.Bootstrap.Env.0.Value`. */
  path: string
}

export function deliveryPlaces(topology: Pick<TopologyFormValues, "Devices">, taskKey: string): DeliveryPlace[] {
  if (!taskKey) return []
  const uses = (text: string) => findRefs(text).some((ref) => ref.kind === "task" && ref.name === taskKey)
  const out: DeliveryPlace[] = []
  topology.Devices.forEach((device, deviceIndex) => {
    if (device.Type !== "node") return
    const base = { deviceId: device.ID, deviceName: device.Name }
    const at = `Topology.Devices.${deviceIndex}.Bootstrap`
    device.Bootstrap.Env.forEach((variable, row) => { if (uses(variable.Value)) out.push({ kind: "env", ...base, label: variable.Name, row, section: "service", path: `${at}.Env.${row}.Value` }) })
    device.Bootstrap.Files.forEach((file, row) => { if (uses(file.Content)) out.push({ kind: "file", ...base, label: file.Path, row, section: "init", path: `${at}.Files.${row}.Content` }) })
    if (uses(device.Bootstrap.Script)) out.push({ kind: "script", ...base, label: "", row: -1, section: "init", path: `${at}.Script` })
  })
  return out
}
