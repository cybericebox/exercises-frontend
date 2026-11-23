/**
 * labConsole.ts — console lines and the defender's dossier in the test lab (console design 9a.3, 10a).
 *
 * The lab status reports each console line (the cable's serial end, its console end, whether it is up and why not); the schema
 * draws a line that is down in the warning colour, the panel lists the lines with a chip. The dossier tells the human defender
 * its console map, what it must not touch, its credentials and the topology its mode allows.
 */
import type { DeployConsoleCable, DeployDossier, DeployStatus } from "@/api/exercises/deploy"
import type { NormalizedTopology, NormalizedVariant } from "@/api/exercises/versions"
import { t } from "@/i18n/t"

const REASONS = new Set(["WaitingForDevice", "PortDown", "PeerUnreachable", "NodeLineLimit"])

/** The state of a line in words: up, or the reason it is down. */
export function consoleLineText(cable: Pick<DeployConsoleCable, "LineUp" | "Reason">): string {
  if (cable.LineUp) return t("ed.d.cable.up")
  return t(`ed.d.cable.reason.${REASONS.has(cable.Reason) ? cable.Reason : "Unknown"}`)
}

type Ends = { serial: { device: string; port: string }; console: { device: string; port: string } }

/** The serial end and the console end of each console cable of the topology, by device name; null for a connection that is not one. */
export function cableEnds(topology: NormalizedTopology): (Ends | null)[] {
  const byId = new Map(topology.Devices.map((device) => [device.ID, device] as const))
  return topology.Connections.map((connection) => {
    if (connection.Kind !== "console") return null
    const ends = connection.Endpoints.map((endpoint) => {
      const device = byId.get(endpoint.DeviceID)
      if (!device) return null
      const serial = (device.SerialPorts ?? []).some((port) => port.Name === endpoint.Interface)
      return { device: device.Name, port: endpoint.Interface, serial }
    })
    const serial = ends.find((end) => end?.serial)
    const consoleEnd = ends.find((end) => end && !end.serial)
    return serial && consoleEnd ? { serial: { device: serial.device, port: serial.port }, console: { device: consoleEnd.device, port: consoleEnd.port } } : null
  })
}

/** The line of the status for one cable of the topology (matched by its two ends), or undefined while it is not reported. */
export function lineOf(status: DeployStatus | null, ends: Ends): DeployConsoleCable | undefined {
  return status?.ConsoleCables?.find((cable) => cable.Serial.Device === ends.serial.device && cable.Serial.Port === ends.serial.port &&
    cable.Console.Device === ends.console.device && cable.Console.Port === ends.console.port)
}

/** The line state of every console cable of the topology, by connection index (what the schema colours). */
export function cableStatusByConnection(topology: NormalizedTopology, status: DeployStatus | null): Record<number, { up: boolean; label: string }> {
  const out: Record<number, { up: boolean; label: string }> = {}
  cableEnds(topology).forEach((ends, index) => {
    if (!ends) return
    const line = lineOf(status, ends)
    if (line) out[index] = { up: line.LineUp, label: consoleLineText(line) }
  })
  return out
}

/**
 * The topology the dossier shows: the whole one (full), only the devices the defender operates with the switches and hubs they
 * are plugged into and the links between them (operates), or none.
 */
export function dossierTopology(topology: NormalizedTopology, dossier: Pick<DeployDossier, "Topology" | "Operates">): NormalizedTopology | null {
  if (dossier.Topology === "none") return null
  if (dossier.Topology !== "operates") return topology
  const operated = new Set(topology.Devices.filter((device) => dossier.Operates.includes(device.Name)).map((device) => device.ID))
  const kept = new Set(operated)
  for (const connection of topology.Connections) {
    if (connection.Kind === "console") continue
    const [a, b] = connection.Endpoints
    if (!a || !b) continue
    for (const [own, other] of [[a, b], [b, a]] as const) {
      const device = topology.Devices.find((candidate) => candidate.ID === other.DeviceID)
      if (operated.has(own.DeviceID) && device && (device.Type === "unmanaged-switch" || device.Type === "hub")) kept.add(device.ID)
    }
  }
  return {
    ...topology,
    Devices: topology.Devices.filter((device) => kept.has(device.ID)),
    Connections: topology.Connections.filter((connection) => connection.Endpoints.every((endpoint) => kept.has(endpoint.DeviceID))),
  }
}

/**
 * The human of the test lab is the attacker: the variant has opponents and all of them defend, and it declares no defender
 * dossier. Only then is the schema tab hidden (9a.5); every other task keeps it.
 */
export function humanAttacks(variant: Pick<NormalizedVariant, "Opponents">, dossierDeclared: boolean): boolean {
  const opponents = variant.Opponents ?? []
  return !dossierDeclared && opponents.length > 0 && opponents.every((opponent) => opponent.Role === "defense")
}
