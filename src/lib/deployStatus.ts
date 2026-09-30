/**
 * deployStatus.ts — the lab phases a test deploy reports, as user-facing text.
 * The agent sends the phase as an English word; the UI never shows it raw.
 */
import { t } from "@/i18n/t"

const PHASE_KEYS: Record<string, string> = {
  Pending: "admin.exDeploy.phase.pending",
  Provisioning: "admin.exDeploy.phase.provisioning",
  Ready: "admin.exDeploy.phase.ready",
  Suspended: "admin.exDeploy.phase.suspended",
  Failed: "admin.exDeploy.phase.failed",
  Error: "admin.exDeploy.phase.error",
}

/** Localized name of a lab phase; an unknown phase reads as «unknown», never as the raw word. */
export function deployPhaseLabel(phase: string | null | undefined): string {
  return t(PHASE_KEYS[phase ?? ""] ?? "admin.exDeploy.phase.unknown")
}

/** A phase after which polling makes no sense: the lab is up, or it will not come up. */
export function isTerminalPhase(phase: string | null | undefined): boolean {
  return phase === "Ready" || phase === "Failed" || phase === "Error"
}
