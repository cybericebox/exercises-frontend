/**
 * serverFieldPath.ts — turns the `field` of a document error (daemon error model: public context `task`, `device`, `key`,
 * `field`; on import also `path`) into a path in the editor form, so the message can sit beside the control.
 *
 * `field` is relative to what the error names:
 *   task:    check.answer.values · check.answer.input_hint · check.state.interval ·
 *            check.state.conditions[2].port.port · check.state.conditions[0].observation · requires[1]
 *   device:  bootstrap.env[2].name · bootstrap.files[0].source · bootstrap.script · access[1].port · command · args · image ·
 *            (a gateway is a device) dhcp · dhcp_ranges · dns · reverse_connections
 *   variant: variables[1].name
 * Only a reliably identified field gets a path; an unknown shape gives null (the error stays a form-level one).
 */

const OBSERVATION_FORM_KEY: Record<string, string> = {
  file: "File", directory: "Directory", process: "Process", port: "Port", kernel_param: "KernelParam", request: "Request", permission: "Permission", custom: "Custom",
}

/** snake_case to PascalCase: `body_contains` -> `BodyContains`. */
export const pascal = (key: string): string => key.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("")

type Segment = string | number

/** `a[2].b` -> ["a", 1, "b"]: the daemon counts list items from 1 (`hints[1]` is the first hint), the form from 0. null when the text has another shape or an index below 1. */
function segments(field: string): Segment[] | null {
  const out: Segment[] = []
  for (const part of field.split(".")) {
    const match = /^([a-z_]+)((?:\[\d+\])*)$/.exec(part)
    if (!match) return null
    out.push(match[1])
    for (const index of match[2].matchAll(/\[(\d+)\]/g)) {
      if (Number(index[1]) < 1) return null
      out.push(Number(index[1]) - 1)
    }
  }
  return out
}

/** Path below a task (`Check.State.Conditions.2.Port.Port`), or null. */
export function taskFieldPath(field: string): Segment[] | null {
  const parts = segments(field)
  if (!parts) return null
  const [head, ...rest] = parts
  if (head === "requires") return typeof rest[0] === "number" ? ["Requires", rest[0]] : ["Requires"]
  if (head === "key" || head === "name" || head === "difficulty" || head === "description") return [pascal(head)]
  // `hints[N].text`, N from 1 on the wire
  if (head === "hints") return typeof rest[0] === "number" ? (rest[1] === "text" ? ["Hints", rest[0], "Text"] : ["Hints", rest[0]]) : ["Hints"]
  if (head !== "check") return null
  if (rest[0] === "answer") return rest.length === 1 ? ["Check", "Answer"] : ["Check", "Answer", pascal(String(rest[1]))]
  if (rest[0] !== "state") return null
  if (rest[1] === "conditions") {
    const index = rest[2]
    if (typeof index !== "number") return ["Check", "State", "Conditions"]
    const base: Segment[] = ["Check", "State", "Conditions", index]
    if (rest.length === 3) return base
    if (rest[3] === "device_id" || rest[3] === "timeout") return [...base, pascal(String(rest[3]))]
    if (rest[3] === "observation") return [...base, "Kind"]
    const kind = OBSERVATION_FORM_KEY[String(rest[3])]
    if (!kind) return null
    return rest[4] === undefined ? [...base, kind] : [...base, kind, pascal(String(rest[4]))]
  }
  return rest[1] === undefined ? ["Check", "State"] : ["Check", "State", pascal(String(rest[1]))]
}

/** Path below a device (`Bootstrap.Env.2.Name`, `Access.1.Port`), or null. */
export function deviceFieldPath(field: string): Segment[] | null {
  const parts = segments(field)
  if (!parts) return null
  const [head, ...rest] = parts
  if (head === "bootstrap") {
    if (rest.length === 0) return ["Bootstrap"]
    const [group, index, key] = rest
    if ((group === "env" || group === "files") && typeof index === "number") {
      const list = group === "env" ? "Env" : "Files"
      return key === undefined ? ["Bootstrap", list, index] : ["Bootstrap", list, index, pascal(String(key))]
    }
    return ["Bootstrap", pascal(String(group))]
  }
  if (head === "access") {
    const [index, key] = rest
    if (typeof index !== "number") return ["Access"]
    return key === undefined ? ["Access", index] : ["Access", index, pascal(String(key))]
  }
  if (["command", "args", "image", "name", "system", "hardware", "profile", "persistence"].includes(String(head))) return [pascal(String(head))]
  if (head === "dhcp") return ["DHCP"]
  if (head === "dhcp_ranges") return ["DHCPRanges"]
  if (head === "dns") return ["DNS"]
  if (head === "reverse_connections") return ["ReverseConnections"]
  return null
}

/** Path below a variant (`Topology.Variables.1.Name`), or null. */
export function variantFieldPath(field: string): Segment[] | null {
  const parts = segments(field)
  if (!parts) return null
  const [head, ...rest] = parts
  if (head === "variables") {
    const [index, key] = rest
    if (typeof index !== "number") return ["Topology", "Variables"]
    return key === undefined ? ["Topology", "Variables", index] : ["Topology", "Variables", index, pascal(String(key))]
  }
  return null
}

/** Daemon error 23522 (ErrGatewayLimit): more gateways in the lab than the platform allows. */
export const ERR_GATEWAY_LIMIT = 23522

/**
 * Daemon error 23202 (ErrNameHasSeparator): a device name or a variable name has ':'. `field` is "device" (the name of `device`)
 * or "env[M].name" (variable M of `device`, counted from 1; the context also has `name`).
 */
export const ERR_NAME_SEPARATOR = 23202

/** Daemon error 23105 (ErrNodeProfilePersistence): persistence asked on a microvm/vm profile. */
export const ERR_NODE_PROFILE_PERSISTENCE = 23105

/**
 * Path below a device for an error with a code. Most codes use `field` as is (deviceFieldPath); 23105 names
 * `persistence`, but that switch does not exist for the profile, so the error sits at the «Профіль запуску» field.
 */
export function deviceErrorPath(code: number, field: string): Segment[] | null {
  if (code === ERR_NODE_PROFILE_PERSISTENCE) return ["Profile"]
  // 23522 (ErrGatewayLimit): `device` is the first gateway over the limit, so the error sits at its name.
  if (code === ERR_GATEWAY_LIMIT) return ["Name"]
  // 23202: field "device" is the name of the device itself, "env[M].name" is a variable of its environment (`bootstrap.` is left out on the wire).
  if (code === ERR_NAME_SEPARATOR) return field === "device" ? ["Name"] : deviceFieldPath(`bootstrap.${field}`)
  return deviceFieldPath(field)
}
