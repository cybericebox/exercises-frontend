/**
 * testLab.ts — what a running test lab means, as plain values the test screen renders: where each device is on its way
 * up (queue, start, initialization with its attempt, ready, failed), the one status of the whole lab, the VPN control
 * state, the result of a state task per device and the places a task's answer is delivered to.
 *
 * Everything here is a pure mapping of the daemon's `DeployStatus` (docs/exercise-http-api-1.0.md, "Test deploy status")
 * and of the saved variant; no text is produced here, the components choose the words through t().
 */
import type { DeployDeviceStatus, DeployStateTask, DeployStatus } from "@/api/exercises/deploy"
import { OBSERVATION_KINDS, OBSERVATION_WIRE_KEY, type ConditionDTO, type ObservationKind } from "@/api/exercises/model"
import { type NormalizedDevice, type NormalizedTask } from "@/api/exercises/versions"
import { isGatewayType } from "@/lib/gatewayTypes"

/** How many tries the laboratory gives a device initialization before it reports a failure. */
export const BOOTSTRAP_MAX_ATTEMPTS = 3

// ── Devices ────────────────────────────────────────────────────────────────────

export type DeviceStageKind = "waiting" | "queued" | "starting" | "initializing" | "ready" | "initFailed" | "failed"

export type DeviceStage = {
  kind: DeviceStageKind
  /** The initialization attempt in progress or the last one made (1-based); 0 when none. */
  attempt: number
  /** The short text the laboratory gives for a failed initialization; empty when none. */
  reason: string
  /** Index of the segment reached on the progress strip, and the strip's length. */
  step: number
  steps: number
  /** The device has an initialization at all. */
  hasInit: boolean
}

/** Where one device is. `labPhase` tells a device that has no scheduling info yet whether it is waiting or already starting. */
export function deviceStage(device: DeployDeviceStatus | undefined, labPhase: string | undefined): DeviceStage {
  const boot = device?.Bootstrap ?? null
  const hasInit = boot !== null
  const steps = hasInit ? 4 : 3
  const make = (kind: DeviceStageKind, step: number, extra: Partial<DeviceStage> = {}): DeviceStage =>
    ({ kind, attempt: 0, reason: "", step, steps, hasInit, ...extra })
  if (!device) return make("waiting", 0)
  if (device.Scheduling?.Failure) return make("failed", 1)
  if (boot?.Phase === "failed") return make("initFailed", 2, { attempt: Math.max(1, boot.Attempts), reason: boot.Reason ?? "" })
  if (boot?.Phase === "pending") return make("initializing", 2, { attempt: Math.max(1, boot.Attempts) })
  if (device.Ready) return make("ready", steps - 1, { attempt: boot?.Attempts ?? 0 })
  const state = device.Scheduling?.State
  if (state === "Queued") return make("queued", 0)
  if (state === "Starting" || state === "Started") return make("starting", 1)
  return labPhase === "Queued" || labPhase === "Pending" || !labPhase ? make("waiting", 0) : make("starting", 1)
}

/**
 * The stage of a device of the variant. A hub or a switch has no pod, so the lab does not list it: it is there once the lab
 * is ready. A node the lab does not list yet is waiting.
 */
export function stageFor(device: Pick<NormalizedDevice, "Name" | "Type">, status: DeployStatus | null | undefined): DeviceStage {
  // A gateway is told by the lab's gateway list, not by the lab as a whole: ready once it is listed and ready, waiting before that.
  if (isGatewayType(device.Type)) {
    const ready = Boolean(status?.Gateways?.find((entry) => entry.Name === device.Name)?.Ready)
    return { kind: ready ? "ready" : "waiting", attempt: 0, reason: "", step: ready ? 2 : 0, steps: 3, hasInit: false }
  }
  const live = status?.Devices?.find((entry) => entry.Name === device.Name)
  if (!live && device.Type !== "node") return { kind: status?.Ready ? "ready" : "waiting", attempt: 0, reason: "", step: status?.Ready ? 2 : 0, steps: 3, hasInit: false }
  return deviceStage(live, status?.Phase)
}

/** The device is on its way up (not ready and not failed). */
export const isDeviceBusy = (stage: DeviceStage) => stage.kind === "waiting" || stage.kind === "queued" || stage.kind === "starting" || stage.kind === "initializing"
export const isDeviceFailed = (stage: DeviceStage) => stage.kind === "failed" || stage.kind === "initFailed"

// ── The lab as a whole ─────────────────────────────────────────────────────────

export type LabChipKind = "creating" | "queued" | "starting" | "ready" | "deviceFailed" | "failed" | "expired" | "removing"

export type LabChip = { kind: LabChipKind; ready: number; total: number; failed: string[]; queuePosition: number | null }

/** The one status of the lab: what the header chip says. `status` null = the lab was just asked for. */
export function labChip(status: DeployStatus | null | undefined, startFailed = false, topology?: ReadonlyArray<Pick<NormalizedDevice, "Name" | "Type">>): LabChip {
  const devices = status?.Devices ?? []
  // With the topology known, count every device of the schema (hub and switch included), so the chip and the device list show one number.
  const stages = topology
    ? topology.map((device) => ({ name: device.Name, stage: stageFor(device, status) }))
    : devices.map((device) => ({ name: device.Name, stage: deviceStage(device, status?.Phase) }))
  const ready = stages.filter((entry) => entry.stage.kind === "ready").length
  const failed = stages.filter((entry) => isDeviceFailed(entry.stage)).map((entry) => entry.name)
  const base = { ready, total: stages.length, failed, queuePosition: status?.Queue && status.Queue.Position > 0 ? status.Queue.Position : null }
  if (startFailed || status?.Phase === "Failed" || status?.Phase === "Error") return { ...base, kind: "failed" }
  if (!status) return { ...base, kind: "creating" }
  if (status.Removing || status.Phase === "Removing") return { ...base, kind: "removing" }
  if (status.Expired) return { ...base, kind: "expired" }
  if (!status.Ready) return { ...base, kind: devices.length === 0 ? (status.Queue ? "queued" : "creating") : "starting" }
  if (stages.some((entry) => isDeviceBusy(entry.stage))) return { ...base, kind: "starting" }
  if (failed.length > 0) return { ...base, kind: "deviceFailed" }
  return { ...base, kind: "ready" }
}

// ── VPN ────────────────────────────────────────────────────────────────────────

export type VpnState = "pending" | "available" | "connected"

export type VpnView = {
  /** The configuration can be downloaded. */
  ready: boolean
  /** null: the status is not known. */
  connected: boolean | null
  state: VpnState
}

/** The VPN of a test lab, as the event site's control reads it (ready / connected / state). */
export function vpnView(status: DeployStatus | null | undefined): VpnView {
  const ready = Boolean(status?.Ready && status.VPNConfig && !status.Expired && !status.Removing)
  const connected = ready ? status?.VPNConnected ?? null : null
  return { ready, connected, state: !ready ? "pending" : connected === true ? "connected" : "available" }
}

// ── State tasks ────────────────────────────────────────────────────────────────

export type ConditionLine = { kind: ObservationKind; /** The identifying value of the observation (path, process, port...). */ subject: string }

const clip = (text: string, max = 60) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

/** The kind of observation a condition holds and what it looks at. */
export function conditionLine(condition: ConditionDTO): ConditionLine {
  const kind = OBSERVATION_KINDS.find((candidate) => condition[OBSERVATION_WIRE_KEY[candidate]] !== undefined) ?? "custom"
  switch (kind) {
    case "file": return { kind, subject: condition.File?.Path ?? "" }
    case "directory": return { kind, subject: condition.Directory?.Path ?? "" }
    case "process": return { kind, subject: condition.Process?.Name || condition.Process?.Matches || "" }
    case "port": return { kind, subject: `${condition.Port?.Port ?? ""}/${condition.Port?.Protocol || "tcp"}` }
    case "kernelParam": return { kind, subject: condition.KernelParam?.Name ?? "" }
    case "request": {
      const request = condition.Request
      return { kind, subject: request ? `${request.Protocol}://${request.Host || "localhost"}:${request.Port}${request.Path ?? ""}` : "" }
    }
    case "permission": return { kind, subject: condition.Permission ? `${condition.Permission.User}: ${condition.Permission.Path}` : "" }
    default: return { kind, subject: clip(condition.Custom?.Run ?? "") }
  }
}

export type StateCheckView = {
  id: string
  device: string
  conditions: ConditionLine[]
  known: boolean
  passed: boolean
  changedAt: string | null
  /** The laboratory's own words about the result; for the author only. */
  detail: string
}

export type StateTaskView = {
  /** solved: done now (or once, for the mode `once`); notSolved: results known, not all passed; unknown: no result yet. */
  status: "solved" | "notSolved" | "unknown"
  checks: StateCheckView[]
  /** A device of the task is not ready: the check cannot run now. */
  blockedBy: string[]
  solvedAt: string | null
  /** The first time every check had passed (kept after the task goes back to unsolved). */
  firstSolvedAt: string | null
}

/**
 * One state task of the saved variant joined with its status. A laboratory check is one per (task, device) and its id is
 * `<task key>:<n>`, n being the position of the device among the devices of the task's conditions, from 1.
 */
export function stateTaskView(task: NormalizedTask, state: DeployStateTask | undefined, devices: readonly NormalizedDevice[], status: DeployStatus | null | undefined): StateTaskView {
  const conditions = task.Check.State?.Conditions ?? []
  const order: string[] = []
  for (const condition of conditions) if (!order.includes(condition.DeviceID)) order.push(condition.DeviceID)
  const nameOf = (id: string) => devices.find((device) => device.ID === id)?.Name ?? ""
  const checks: StateCheckView[] = order.map((deviceId, index) => {
    const id = `${task.Key}:${index + 1}`
    const result = state?.Checks.find((check) => check.ID === id)
    return {
      id, device: nameOf(deviceId),
      conditions: conditions.filter((condition) => condition.DeviceID === deviceId).map(conditionLine),
      known: result?.Known ?? false, passed: result?.Passed ?? false, changedAt: result?.ChangedAt ?? null, detail: result?.Detail ?? "",
    }
  })
  const solved = Boolean(state?.Solved)
  const known = Boolean(state?.Known) && checks.length > 0 && checks.every((check) => check.known)
  const blockedBy = checks.map((check) => check.device).filter((name) => {
    const device = status?.Devices?.find((candidate) => candidate.Name === name)
    return device ? deviceStage(device, status?.Phase).kind !== "ready" : false
  })
  return { status: solved ? "solved" : known ? "notSolved" : "unknown", checks, blockedBy, solvedAt: state?.SolvedAt ?? null, firstSolvedAt: state?.FirstSolvedAt ?? null }
}

/** «30s», «1m30s», «2h» (the daemon's Go duration) as seconds; null for an empty or no-schedule value. */
export function durationSeconds(value: string | undefined): number | null {
  if (!value || value === "0") return null
  const parts = [...value.matchAll(/(\d+(?:\.\d+)?)(h|m|s)/g)]
  if (parts.length === 0) return null
  const total = parts.reduce((sum, [, amount, unit]) => sum + Number(amount) * (unit === "h" ? 3600 : unit === "m" ? 60 : 1), 0)
  return total > 0 ? Math.round(total) : null
}

// ── Where an answer is delivered ──────────────────────────────────────────────

/** The names of the devices whose initialization uses `{{task.<key>}}` (environment, files or the script). */
export function deliveredTo(taskKey: string, devices: readonly NormalizedDevice[]): string[] {
  const token = `{{task.${taskKey}}}`
  return devices.filter((device) => {
    const boot = device.Bootstrap
    return boot.Env.some((entry) => entry.Value.includes(token)) || boot.Files.some((file) => file.Content.includes(token)) || boot.Script.includes(token)
  }).map((device) => device.Name)
}

// ── Console ───────────────────────────────────────────────────────────────────

/** The device offers a browser console (a `terminal` access entry). */
export const hasConsole = (device: NormalizedDevice | undefined) => Boolean(device?.Access.some((entry) => entry.Kind === "terminal"))

// ── Time ──────────────────────────────────────────────────────────────────────

const two = (n: number) => String(n).padStart(2, "0")

/** «21:08:20» (local time) of an instant. */
export function clockTime(at: string | number | Date): string {
  const date = new Date(at)
  return `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`
}

/** «1:42:10»: the time left; never negative. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(total / 3600)}:${two(Math.floor((total % 3600) / 60))}:${two(total % 60)}`
}

/** «03:07»: how long a start has been going. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  return `${two(Math.floor(total / 60))}:${two(total % 60)}`
}
