/**
 * consolePorts.ts — console ports, serial ports and console cables in the editor form (console design, sections 4 and 10).
 *
 * A node (not a Windows device) declares console ports (console0..., aux0...: its management lines, with the program that runs on
 * them) and serial ports (serial0...: terminal lines that appear inside the device as /dev/ttyCON<n>). A console cable is a
 * connection of kind "console": one serial end and one console end on two devices, never through a switch or a hub, never a
 * NIC, one cable per port. Port names and interface names share one space per device.
 * The rules mirror the backend (internal/model/exercise/console.go); the server stays authoritative.
 */
import type { ConsolePortDTO, SerialPortDTO } from "@/api/exercises/versions"

/** Limits of the laboratory (the capabilities give the current ones; these are the defaults of an older server). */
export const MAX_CONSOLE_PORTS = 4
export const MAX_SERIAL_PORTS = 16
export const MAX_CONSOLE_CABLES = 64
/** What a console port runs when it declares neither a command nor a native line. */
export const DEFAULT_CONSOLE_COMMAND = "/bin/login"
export const DEFAULT_CONSOLE_USER = "root"
/** serial<n> is /dev/ttyCON<n> unless its path is set. */
export const SERIAL_PATH_PREFIX = "/dev/ttyCON"
export const CONSOLE_PORT_NAME_RE = /^(console|aux)(0|[1-9][0-9]?)$/
export const SERIAL_PORT_NAME_RE = /^serial(0|[1-9][0-9]?)$/
const SERIAL_PATH_RE = /^\/dev\/tty[A-Z][A-Za-z0-9]{0,14}$/
const RESERVED_SERIAL_PATHS = new Set(["/dev/tty", "/dev/console", "/dev/ptmx"])
export const MAX_CONSOLE_COMMAND_ENTRIES = 32
export const MAX_CONSOLE_COMMAND_ENTRY_BYTES = 4096

/** program: a command (empty = /bin/login as root); stdio: the service's own terminal; tcp: a port on the device's loopback. */
export const CONSOLE_MODES = ["program", "stdio", "tcp"] as const
export type ConsoleMode = (typeof CONSOLE_MODES)[number]

/** A console port in the form. Mode is one of CONSOLE_MODES (a native kind the platform set, such as vm-serial, is kept as is); Port is typed text. */
export type ConsolePortForm = { Name: string; Mode: string; Command: string[]; User: string; Port: string }
/** A serial port in the form; an empty Path is the default /dev/ttyCON<n>. */
export type SerialPortForm = { Name: string; Path: string }

/** What a device needs for its port rules: its kind, its system and its names. */
export type PortDevice = {
  ID: string
  Name: string
  Type: string
  System?: string
  Interfaces: { Name: string }[]
  ConsolePorts?: { Name: string }[]
  SerialPorts?: { Name: string }[]
}
type PortEndpoint = { Kind?: string; DeviceID: string; Interface: string }
type PortConnection = { Kind?: string; Endpoints: PortEndpoint[] }

export const isConsoleConnection = (connection: { Kind?: string }): boolean => connection.Kind === "console"

export function consolePortToForm(port: ConsolePortDTO): ConsolePortForm {
  return {
    Name: port.Name,
    Mode: port.Native ? port.Native.Kind : "program",
    Command: port.Command ?? [],
    User: port.User ?? "",
    Port: port.Native?.Port ? String(port.Native.Port) : "",
  }
}

export function consolePortToDTO(port: ConsolePortForm): ConsolePortDTO {
  if (port.Mode === "program") {
    return { Name: port.Name, ...(port.Command.length ? { Command: port.Command } : {}), ...(port.User ? { User: port.User } : {}) }
  }
  const number = Number(port.Port)
  const withPort = port.Mode !== "stdio" && port.Port.trim() !== "" && Number.isFinite(number)
  return { Name: port.Name, Native: { Kind: port.Mode, ...(withPort ? { Port: number } : {}) } }
}

export const serialPortToForm = (port: SerialPortDTO): SerialPortForm => ({ Name: port.Name, Path: port.Path ?? "" })
export const serialPortToDTO = (port: SerialPortForm): SerialPortDTO => ({ Name: port.Name, ...(port.Path ? { Path: port.Path } : {}) })

/** The character device of a serial port inside its device: its path, or /dev/ttyCON<n> for serial<n>. */
export function serialDevicePath(port: { Name: string; Path?: string }): string {
  return port.Path ? port.Path : `${SERIAL_PATH_PREFIX}${port.Name.replace(/^serial/, "")}`
}

/** The first free name `<prefix><n>` (n from 0) among the names of the device. */
export function nextPortName(prefix: "console" | "aux" | "serial", taken: string[]): string {
  const used = new Set(taken)
  let n = 0
  while (used.has(`${prefix}${n}`)) n++
  return `${prefix}${n}`
}

export const emptyConsolePort = (name: string): ConsolePortForm => ({ Name: name, Mode: "program", Command: [], User: "", Port: "" })
export const emptySerialPort = (name: string): SerialPortForm => ({ Name: name, Path: "" })

/** A device may declare ports: a node that is not a Windows device (those have VNC or RDP only). */
export function canHavePorts(device: Pick<PortDevice, "Type" | "System">): boolean {
  return device.Type === "node" && device.System !== "windows"
}

export function validSerialPath(path: string): boolean {
  return !RESERVED_SERIAL_PATHS.has(path) && SERIAL_PATH_RE.test(path)
}

const bytes = (value: string) => new TextEncoder().encode(value).length

/** Why a console command is refused ("" = valid; empty is the default). The program is an absolute path outside /proc and /sys. */
export function consoleCommandProblem(command: string[]): "" | "absolute" | "virtual" | "entries" | "entry" {
  if (command.length === 0) return ""
  if (command.length > MAX_CONSOLE_COMMAND_ENTRIES) return "entries"
  if (command.some((entry) => bytes(entry) > MAX_CONSOLE_COMMAND_ENTRY_BYTES || entry.includes("\u0000"))) return "entry"
  const program = command[0]
  if (!program.startsWith("/")) return "absolute"
  const clean = `/${program.split("/").filter((part) => part !== "" && part !== ".").join("/")}`
  if (["/proc", "/sys"].some((virtual) => clean === virtual || clean.startsWith(`${virtual}/`))) return "virtual"
  return ""
}

/** The kind of a name of a device as a connection end: a NIC (interface, switch or gateway port), a serial or a console port. */
export type PortKind = "nic" | "serial" | "console" | null

export function portKindOf(device: PortDevice, name: string, nicNames?: (device: PortDevice) => string[]): PortKind {
  if (device.Type !== "node") return nicNames?.(device).includes(name) ? "nic" : null
  if (device.Interfaces.some((iface) => iface.Name === name)) return "nic"
  if ((device.ConsolePorts ?? []).some((port) => port.Name === name)) return "console"
  if ((device.SerialPorts ?? []).some((port) => port.Name === name)) return "serial"
  return null
}

/** The ports of the device already taken by a connection end (a NIC or a port), except the end being edited. */
function usedNames(connections: PortConnection[], deviceID: string, editing?: { connectionIndex: number; side: number }): Set<string> {
  const used = new Set<string>()
  connections.forEach((connection, connectionIndex) => connection.Endpoints.forEach((endpoint, side) => {
    if (endpoint.DeviceID === deviceID && !(editing?.connectionIndex === connectionIndex && editing.side === side)) used.add(endpoint.Interface)
  }))
  return used
}

/** The free serial and console ports of a device (none on a device that cannot have ports). */
export function freeLinePorts(connections: PortConnection[], device: PortDevice, editing?: { connectionIndex: number; side: number }): { serial: string[]; console: string[] } {
  if (device.Type !== "node") return { serial: [], console: [] }
  const used = usedNames(connections, device.ID, editing)
  return {
    serial: (device.SerialPorts ?? []).map((port) => port.Name).filter((name) => name !== "" && !used.has(name)),
    console: (device.ConsolePorts ?? []).map((port) => port.Name).filter((name) => name !== "" && !used.has(name)),
  }
}

/** True when a console cable can still start at the device: it has a free serial or console port. */
export function canStartConsoleCable(connections: PortConnection[], device: PortDevice): boolean {
  const free = freeLinePorts(connections, device)
  return free.serial.length > 0 || free.console.length > 0
}

/** True when a console cable can join the two devices: one has a free serial port and the other a free console port. */
export function canJoinConsoleCable(connections: PortConnection[], a: PortDevice, b: PortDevice): boolean {
  if (a.ID === b.ID) return false
  const fa = freeLinePorts(connections, a)
  const fb = freeLinePorts(connections, b)
  return (fa.serial.length > 0 && fb.console.length > 0) || (fa.console.length > 0 && fb.serial.length > 0)
}

/** Why the two ends of a console cable are not one serial and one console port of two devices (the backend reason), or null. */
export function consoleCableProblem(connection: PortConnection, devices: PortDevice[]): "unresolved" | "two_serial" | "two_console" | "same_device" | "nic" | null {
  const [a, b] = connection.Endpoints
  if (!a || !b || !a.DeviceID || !b.DeviceID || !a.Interface || !b.Interface) return "unresolved"
  const da = devices.find((device) => device.ID === a.DeviceID)
  const db = devices.find((device) => device.ID === b.DeviceID)
  if (!da || !db) return "unresolved"
  const ka = portKindOf(da, a.Interface)
  const kb = portKindOf(db, b.Interface)
  if (ka === "nic" || kb === "nic") return "nic"
  if (ka === null || kb === null) return "unresolved"
  if (da.ID === db.ID) return "same_device"
  if (ka === kb) return ka === "serial" ? "two_serial" : "two_console"
  return null
}

/** The serial end and the console end of a console cable (either order on the wire), or null when they are not one of each. */
export function consoleCableEnds<E extends PortEndpoint>(connection: { Endpoints: E[] }, devices: PortDevice[]): { serial: E; console: E } | null {
  const [a, b] = connection.Endpoints
  if (!a || !b) return null
  const kind = (end: E) => { const device = devices.find((candidate) => candidate.ID === end.DeviceID); return device ? portKindOf(device, end.Interface) : null }
  const ka = kind(a)
  const kb = kind(b)
  if (ka === "serial" && kb === "console") return { serial: a, console: b }
  if (ka === "console" && kb === "serial") return { serial: b, console: a }
  return null
}

/** The devices a console cable of the device leads to (by name): what sits at the other end of each of its cables. */
export function consoleLinksOf(topology: { Devices: PortDevice[]; Connections: PortConnection[] }, deviceID: string): string[] {
  const names: string[] = []
  for (const connection of topology.Connections) {
    if (!isConsoleConnection(connection)) continue
    const own = connection.Endpoints.findIndex((endpoint) => endpoint.DeviceID === deviceID)
    if (own < 0) continue
    const other = connection.Endpoints[own === 0 ? 1 : 0]
    const device = other && topology.Devices.find((candidate) => candidate.ID === other.DeviceID)
    if (device && device.ID !== deviceID && !names.includes(device.Name)) names.push(device.Name)
  }
  return names
}

/** The renamed port of a device follows into its console cables: every end on (device, from) becomes (device, to). */
export function renamePortInConnections<C extends PortConnection>(connections: C[], deviceID: string, from: string, to: string): C[] {
  if (from === to || from === "") return connections
  let changed = false
  const next = connections.map((connection) => {
    if (!isConsoleConnection(connection) || !connection.Endpoints.some((endpoint) => endpoint.DeviceID === deviceID && endpoint.Interface === from)) return connection
    changed = true
    return { ...connection, Endpoints: connection.Endpoints.map((endpoint) => endpoint.DeviceID === deviceID && endpoint.Interface === from ? { ...endpoint, Interface: to } : endpoint) }
  })
  return changed ? next : connections
}

/** The console cables that end on (device, port), by index. */
export function cablesOnPort(connections: PortConnection[], deviceID: string, port: string): number[] {
  const out: number[] = []
  connections.forEach((connection, index) => {
    if (isConsoleConnection(connection) && connection.Endpoints.some((endpoint) => endpoint.DeviceID === deviceID && endpoint.Interface === port)) out.push(index)
  })
  return out
}
