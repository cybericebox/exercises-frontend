/**
 * deviceLive.ts — user-facing text for the live state of a lab: the launch queue,
 * a device that did not start and the saved-state age. The backend sends reasons as
 * English codes; the UI never shows them raw.
 */
import type { DeployDeviceStatus, DeployQueue } from "@/api/exercises/deploy"
import { t } from "@/i18n/t"

const QUEUE_REASONS = new Set(["InFlightLimit", "WaitingForGroup", "WaitingForTurn", "PreparingImages", "InsufficientResources", "NoSchedulableNodes", "TenantQuota"])
const FAILURE_REASONS = new Set(["ImagePull", "CrashLoop", "Unschedulable", "StartupTimeout", "DoesNotFit"])

/** The line shown while the lab waits; null when it is not queued (or every device is already dispatched). */
export function queueLine(queue: DeployQueue | null | undefined): string | null {
  if (!queue) return null
  if (queue.Position <= 0) return t("admin.exQueue.dispatched")
  const reason = t(QUEUE_REASONS.has(queue.Reason) ? `admin.exQueue.reason.${queue.Reason}` : "admin.exQueue.reason.unknown")
  return t("admin.exQueue.status", { position: queue.Position, length: queue.Length, reason })
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
