/**
 * refs.ts — substitutions of the exercise document: `{{task.<key>}}` (the answer of a task) and `{{var.<name>}}`
 * (a variable of the infrastructure). They work in Bootstrap.Env values, Bootstrap.Files content, Bootstrap.Script and
 * in the expectations of state conditions; `\{{` is a literal `{{`. An unresolved reference is an error naming the field.
 *
 * Pure helpers shared by the tasks package (where does the answer go, «Куди передається відповідь») and the
 * infrastructure package (the picker lists answers and variables by name, never raw braces).
 */
import type { TaskFormValues } from "./schemas/task"
import type { DeviceFormValues, TopologyFormValues } from "./schemas/infra"

export type RefKind = "task" | "var"
export type Ref = { kind: RefKind; name: string; /** The text as written, `{{task.web}}`. */ text: string }

const REF = /(\\)?\{\{(task|var)\.([A-Za-z0-9_]+)\}\}/g

/** The references in a text (an escaped `\{{` is not one). */
export function findRefs(text: string): Ref[] {
  const out: Ref[] = []
  for (const match of text.matchAll(REF)) {
    if (match[1]) continue
    out.push({ kind: match[2] as RefKind, name: match[3], text: `{{${match[2]}.${match[3]}}}` })
  }
  return out
}

export type KnownRefs = { tasks: ReadonlySet<string>; vars: ReadonlySet<string> }

export function knownRefsOf(tasks: Pick<TaskFormValues, "Key">[], variables: { Name: string }[]): KnownRefs {
  return { tasks: new Set(tasks.map((task) => task.Key).filter(Boolean)), vars: new Set(variables.map((variable) => variable.Name).filter(Boolean)) }
}

/** References of a text that name no task or variable of the variant (as written). */
export function unknownRefs(text: string, known: KnownRefs): string[] {
  return findRefs(text).filter((ref) => !(ref.kind === "task" ? known.tasks : known.vars).has(ref.name)).map((ref) => ref.text)
}

/** Where the answer of a task reaches a device: an environment variable, a file or the script. */
export type Delivery =
  | { kind: "env"; deviceId: string; deviceName: string; name: string }
  | { kind: "file"; deviceId: string; deviceName: string; path: string }
  | { kind: "script"; deviceId: string; deviceName: string }

const nodeDevices = (devices: DeviceFormValues[]) => devices.filter((device) => device.Type === "node")

/** Every place of the variant where `{{task.<key>}}` is delivered into a device. */
export function deliveriesOfTask(topology: Pick<TopologyFormValues, "Devices">, key: string): Delivery[] {
  if (!key) return []
  const out: Delivery[] = []
  const uses = (text: string) => findRefs(text).some((ref) => ref.kind === "task" && ref.name === key)
  for (const device of nodeDevices(topology.Devices)) {
    const base = { deviceId: device.ID, deviceName: device.Name }
    for (const variable of device.Bootstrap.Env) if (uses(variable.Value)) out.push({ kind: "env", ...base, name: variable.Name })
    for (const file of device.Bootstrap.Files) if (uses(file.Content)) out.push({ kind: "file", ...base, path: file.Path })
    if (uses(device.Bootstrap.Script)) out.push({ kind: "script", ...base })
  }
  return out
}

/** Names of the node devices of the topology that take part in a delivery of the task, in order of appearance. */
export function deliveryDevices(deliveries: Delivery[]): string[] {
  return [...new Set(deliveries.map((delivery) => delivery.deviceName))]
}
