import type { DeployStatus } from "@/api/exercises/deploy"
import type { NormalizedTask } from "@/api/exercises/versions"
import { t } from "@/i18n/t"
import { taskValues, UNRESOLVED, type TaskValues } from "@/lib/placeholderResolve"

/** The port of an `external` target that stands for the device's console (a real port is never 0). */
export const CONSOLE_PORT = 0

/** What a lab with no values yet resolves against: every address reads as a dash. */
export const PENDING_STATUS: DeployStatus = { Phase: "Pending", Ready: false, Gateways: [] }
/** What a static test (no lab) resolves against: only fixed values resolve, lab-bound ones stay a dash. */
export const STATIC_STATUS: DeployStatus = { Phase: "Ready", Ready: true, Gateways: [] }

/**
 * The values a participant sees in a task of this lab. On top of the shared resolver: a placeholder link to the console
 * (`external.link` with `Access: terminal`) becomes a clickable text that opens the console of its device.
 */
export function participantValues(task: NormalizedTask, status: DeployStatus, labReady: boolean): TaskValues {
  const values = taskValues(task.Placeholders, status)
  for (const placeholder of task.Placeholders ?? []) {
    if (placeholder.Kind !== "external.link" || placeholder.Access !== "terminal" || !placeholder.Key || !placeholder.DeviceName) continue
    if (labReady) {
      values.variables[placeholder.Key] = t("ed.d.console.linkText", { device: placeholder.DeviceName })
      values.external[placeholder.Key] = { device: placeholder.DeviceName, port: CONSOLE_PORT }
    } else {
      values.variables[placeholder.Key] = UNRESOLVED
      delete values.external[placeholder.Key]
    }
  }
  return values
}
