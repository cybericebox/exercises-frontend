/**
 * deviceLive.ts — user-facing text for the live state of a lab: the launch queue,
 * a device that did not start and the saved-state age. The backend sends reasons as
 * English codes; the UI never shows them raw.
 */
import type { DeployDeviceStatus, DeployQueue } from "@/api/exercises/deploy"
import { t } from "@/i18n/t"

/** Reasons that mean the cluster has no room; the author sees «not enough resources», never the code. */
const NO_RESOURCES_REASONS = new Set(["InsufficientResources", "NoSchedulableNodes", "TenantQuota", "DoesNotFitNow", "ReservationMissing",
  "ReservationNotActive", "ReservationFull", "Withdrawn"])
/** How long a starting lab may take before the author gets a reassuring second line. */
export const LONG_WAIT_MS = 30_000
const FAILURE_REASONS = new Set(["ImagePull", "CrashLoop", "Unschedulable", "StartupTimeout", "DoesNotFit"])

/** The second line of a starting lab: null before the long wait, then «a cluster node starts» while sent pods wait for a new node,
 * «not enough resources» for a resource reason (a withdrawn launch included) or the generic «almost there». */
export function startingNote(queue: DeployQueue | null | undefined, longWait: boolean): string | null {
  if (!longWait) return null
  if (queue?.Reason === "NodeStarting") return t("admin.exDeploy.startingNodeStarting")
  return t(queue && NO_RESOURCES_REASONS.has(queue.Reason) ? "admin.exDeploy.startingNoResources" : "admin.exDeploy.startingLong")
}

/** The earliest time any device of the lab was queued (ms); null when the status carries none. */
export function earliestQueuedAt(devices: DeployDeviceStatus[] | undefined): number | null {
  const times = (devices ?? []).map((device) => Date.parse(device.Scheduling?.QueuedAt ?? "")).filter((time) => !Number.isNaN(time))
  return times.length > 0 ? Math.min(...times) : null
}

export function failureReasonLabel(reason: string): string {
  return t(FAILURE_REASONS.has(reason) ? `admin.exLive.failure.${reason}` : "admin.exLive.failure.unknown")
}

/** Devices whose pod did not start (they may still become ready). */
export function failedDevices(devices: DeployDeviceStatus[] | undefined): DeployDeviceStatus[] {
  return (devices ?? []).filter((device) => device.Scheduling?.Failure)
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [["day", 86400], ["hour", 3600], ["minute", 60], ["second", 1]]

/** «5 хвилин тому» in the active language (Ukrainian). */
export function agoText(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  const [unit, size] = UNITS.find(([, size]) => seconds >= size) ?? UNITS[UNITS.length - 1]
  return new Intl.RelativeTimeFormat("uk", { numeric: "auto" }).format(-Math.floor(seconds / size), unit)
}

export function sizeText(bytes: number): string {
  if (bytes >= 1024 ** 3) return t("admin.exLive.size.gb", { n: (bytes / 1024 ** 3).toFixed(1) })
  if (bytes >= 1024 ** 2) return t("admin.exLive.size.mb", { n: (bytes / 1024 ** 2).toFixed(1) })
  if (bytes >= 1024) return t("admin.exLive.size.kb", { n: Math.round(bytes / 1024) })
  return t("admin.exLive.size.b", { n: bytes })
}

/** Image warnings of a status as one text; null when there is nothing to warn about. */
export function imageWarningText(status: { ImageWarning?: string; GroupImageWarning?: string } | null): string | null {
  const images = [status?.ImageWarning, status?.GroupImageWarning].filter(Boolean).join(", ")
  return images ? t("admin.exLive.imageWarning", { images }) : null
}
