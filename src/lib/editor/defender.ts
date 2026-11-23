/**
 * defender.ts — the defender block of a variant (console design 9a.1) and the seats of the opponents (8.1) in the editor form.
 *
 * The block tells the defender of the lab (human or bot) its dossier: the seat (the node with serial ports the human defender
 * sits at; its console cables are the runbook), the topology the dossier shows (full, operates, none), the devices it must not
 * console into (empty: the default complement, every device with a console port it does not operate) and the operator
 * credentials. A secret credential follows the secret env value: never returned (HasValue = stored), a blank value keeps it.
 * The rules mirror the backend (internal/model/exercise/defender.go, opponent.go validateSeats); the server stays authoritative.
 */
import type { z } from "zod"
import { t } from "@/i18n/t"
import type { DefenderCredentialDTO, DefenderDTO, DefenderTopology, OpponentDTO } from "@/api/exercises/versions"
import { consoleLinksOf, isConsoleConnection, portKindOf, type PortDevice } from "./consolePorts"

export const MAX_DEFENDER_OFF_LIMITS = 64
export const MAX_DEFENDER_CREDENTIALS = 64
export const MAX_DEFENDER_CREDENTIAL_BYTES = 4096
export const DEFENDER_TOPOLOGIES = ["full", "operates", "none"] as const
const USER_RE = /^([a-z_][a-z0-9_-]{0,31}|\d+)$/
/** The roles that operate devices: only they may have a seat. */
export const SEAT_ROLES = ["defense", "attack-defense"] as const

/** One credential in the form. HasValue: a secret value is stored on the server (its Value is never sent back). */
export type DefenderCredentialForm = { Device: string; Port: string; User: string; Value: string; Secret: boolean; HasValue: boolean; ClientKey?: string }
export type DefenderForm = { Seat: string; Topology: DefenderTopology; OffLimits: string[]; Credentials: DefenderCredentialForm[] }

export const emptyDefender = (): DefenderForm => ({ Seat: "", Topology: "", OffLimits: [], Credentials: [] })
export const emptyCredential = (): DefenderCredentialForm => ({ Device: "", Port: "", User: "", Value: "", Secret: true, HasValue: false })

export function defenderToForm(dto: DefenderDTO | undefined | null): DefenderForm | null {
  if (!dto) return null
  return {
    Seat: dto.Seat ?? "",
    Topology: dto.Topology ?? "",
    OffLimits: [...(dto.OffLimits ?? [])],
    // A secret comes back without its value: it is stored.
    Credentials: (dto.Credentials ?? []).map((c) => ({ Device: c.Device, Port: c.Port ?? "", User: c.User ?? "", Value: c.Value ?? "", Secret: c.Secret ?? false, HasValue: Boolean(c.Secret) })),
  }
}

export function defenderToDTO(form: DefenderForm | null | undefined): DefenderDTO | undefined {
  if (!form) return undefined
  const credentials: DefenderCredentialDTO[] = form.Credentials.map((c) => ({
    Device: c.Device, ...(c.Port ? { Port: c.Port } : {}), ...(c.User ? { User: c.User } : {}), Value: c.Value, ...(c.Secret ? { Secret: true } : {}),
  }))
  return {
    ...(form.Seat ? { Seat: form.Seat } : {}),
    ...(form.Topology ? { Topology: form.Topology } : {}),
    ...(form.OffLimits.length ? { OffLimits: form.OffLimits } : {}),
    ...(credentials.length ? { Credentials: credentials } : {}),
  }
}

type Topo = { Devices: (PortDevice & { Type: string })[]; Connections: { Kind?: string; Endpoints: { DeviceID: string; Interface: string }[] }[] }

/** The nodes that can be a seat: nodes with a serial port. */
export function seatCandidates(topology: Topo): PortDevice[] {
  return topology.Devices.filter((device) => device.Type === "node" && (device.SerialPorts ?? []).length > 0)
}

/** True when a console cable ends on a console port of the device (a seat is only a serial-port connector). */
export function isConsoleEnd(topology: Topo, device: PortDevice): boolean {
  return topology.Connections.some((connection) => isConsoleConnection(connection) &&
    connection.Endpoints.some((endpoint) => endpoint.DeviceID === device.ID && portKindOf(device, endpoint.Interface) === "console"))
}

/** True when the device has an interface with a network connection (where a bot run puts its tools device). */
function hasNetwork(topology: Topo, device: PortDevice): boolean {
  return device.Interfaces.some((iface) => topology.Connections.some((connection) => !isConsoleConnection(connection) &&
    connection.Endpoints.some((endpoint) => endpoint.DeviceID === device.ID && endpoint.Interface === iface.Name)))
}

/** Why the seat of opponent `index` is refused (the backend reason), or "" when the editor sees nothing wrong. */
export function opponentSeatProblem(topology: Topo, opponents: OpponentDTO[], index: number): string {
  const opponent = opponents[index]
  if (!opponent?.Seat) return ""
  if (!(SEAT_ROLES as readonly string[]).includes(opponent.Role)) return "seat_forbidden"
  const seat = topology.Devices.find((device) => device.Name === opponent.Seat)
  if (!seat || seat.Type !== "node") return "seat_unknown"
  if ((seat.SerialPorts ?? []).length === 0) return "seat_no_serial"
  if (isConsoleEnd(topology, seat)) return "seat_console_end"
  if (opponents.some((other, oi) => oi < index && other.Seat === opponent.Seat)) return "seat_repeated"
  if (opponents.some((other) => (other.Operates ?? []).includes(opponent.Seat ?? ""))) return "seat_operated"
  if (!hasNetwork(topology, seat)) return "seat_no_network"
  return ""
}

/** The devices offered as the seat of opponent `index`: nodes with serial ports, no console end, that no opponent operates or holds. */
export function opponentSeatOptions(topology: Topo, opponents: OpponentDTO[], index: number): { name: string; reason: string }[] {
  const operated = new Set(opponents.flatMap((opponent) => opponent.Operates ?? []))
  const held = new Set(opponents.filter((_, oi) => oi !== index).map((opponent) => opponent.Seat).filter(Boolean))
  return seatCandidates(topology).map((device) => ({
    name: device.Name,
    reason: isConsoleEnd(topology, device) ? "seat_console_end" : operated.has(device.Name) ? "seat_operated" : held.has(device.Name) ? "seat_repeated" : !hasNetwork(topology, device) ? "seat_no_network" : "",
  }))
}

const bytes = (value: string) => new TextEncoder().encode(value).length

/** The rules of the defender block of variant `vi` (fields under Variants.vi.Defender) and of the seats of its opponents. */
export function refineDefender(vi: number, variant: { Topology: Topo; Opponents?: OpponentDTO[]; Defender?: DefenderForm | null }, ctx: z.RefinementCtx): void {
  const topology = variant.Topology
  const opponents = variant.Opponents ?? []
  opponents.forEach((_, oi) => {
    const problem = opponentSeatProblem(topology, opponents, oi)
    if (problem) ctx.addIssue({ code: "custom", path: ["Variants", vi, "Opponents", oi, "Seat"], message: t(`ed.c.def.seat.${problem}`) })
  })
  const d = variant.Defender
  if (!d) return
  const at = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path: ["Variants", vi, "Defender", ...path], message })
  const byName = new Map(topology.Devices.map((device) => [device.Name, device] as const))
  let cabled: string[] = []
  if (d.Seat) {
    const seat = byName.get(d.Seat)
    if (!seat || seat.Type !== "node") at(["Seat"], t("ed.c.def.seat.seat_unknown"))
    else if ((seat.SerialPorts ?? []).length === 0) at(["Seat"], t("ed.c.def.seat.seat_no_serial"))
    else cabled = consoleLinksOf(topology, seat.ID)
  }
  if (d.OffLimits.length > MAX_DEFENDER_OFF_LIMITS) at(["OffLimits"], t("ed.c.def.val.offLimitsMax", { max: MAX_DEFENDER_OFF_LIMITS }))
  const seen = new Set<string>()
  for (const name of d.OffLimits) {
    if (!byName.has(name)) at(["OffLimits"], t("ed.c.def.val.offLimitsUnknown", { name }))
    else if (seen.has(name)) at(["OffLimits"], t("ed.c.def.val.offLimitsRepeated", { name }))
    else if (cabled.includes(name)) at(["OffLimits"], t("ed.c.def.val.offLimitsCabled", { name }))
    seen.add(name)
  }
  if (d.Credentials.length > MAX_DEFENDER_CREDENTIALS) at(["Credentials"], t("ed.c.def.val.credentialsMax", { max: MAX_DEFENDER_CREDENTIALS }))
  const identities = new Set<string>()
  d.Credentials.forEach((c, ci) => {
    const identity = JSON.stringify([c.Device, c.Port, c.User])
    if (identities.has(identity)) at(["Credentials", ci, "User"], t("ed.c.def.val.credentialRepeated"))
    identities.add(identity)
    const device = byName.get(c.Device)
    if (!c.Device) at(["Credentials", ci, "Device"], t("ed.c.def.val.credentialDevice"))
    else if (!device || device.Type !== "node") at(["Credentials", ci, "Device"], t("ed.c.def.val.credentialUnknown", { name: c.Device }))
    else if (c.Port && portKindOf(device, c.Port) !== "console") at(["Credentials", ci, "Port"], t("ed.c.def.val.credentialPort"))
    if (c.User && !USER_RE.test(c.User)) at(["Credentials", ci, "User"], t("ed.c.val.terminalUser"))
    if (c.Secret && !c.HasValue && c.Value === "") at(["Credentials", ci, "Value"], t("admin.ex.val.secretValue"))
    if (bytes(c.Value) > MAX_DEFENDER_CREDENTIAL_BYTES || c.Value.includes("\u0000")) at(["Credentials", ci, "Value"], t("ed.c.val.envValueBytes", { max: MAX_DEFENDER_CREDENTIAL_BYTES }))
  })
}

/** True when the defender block names the device (its seat, an off-limits entry or a credential). */
export function defenderNamesDevice(defender: DefenderForm | null | undefined, name: string): boolean {
  return Boolean(defender) && name !== "" && (defender!.Seat === name || defender!.OffLimits.includes(name) || defender!.Credentials.some((c) => c.Device === name))
}

/** The block with the device `from` renamed to `to`; the same object when it does not name it. */
export function renameDeviceInDefender(defender: DefenderForm | null | undefined, from: string, to: string): DefenderForm | null | undefined {
  if (!defender || from === to || !defenderNamesDevice(defender, from)) return defender
  return {
    ...defender,
    Seat: defender.Seat === from ? to : defender.Seat,
    OffLimits: defender.OffLimits.map((name) => name === from ? to : name),
    Credentials: defender.Credentials.map((c) => c.Device === from ? { ...c, Device: to } : c),
  }
}

/** The block with a console port of `device` renamed (credentials name ports); the same object when none names it. */
export function renamePortInDefender(defender: DefenderForm | null | undefined, device: string, from: string, to: string): DefenderForm | null | undefined {
  if (!defender || from === to || !defender.Credentials.some((c) => c.Device === device && c.Port === from)) return defender
  return { ...defender, Credentials: defender.Credentials.map((c) => c.Device === device && c.Port === from ? { ...c, Port: to } : c) }
}
