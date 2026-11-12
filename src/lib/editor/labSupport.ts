/**
 * labSupport.ts — what the laboratories can run, as one answer per option (the daemon block `LabCapabilities`).
 * Packages call `labSupport(caps, kind)` (or `useLabSupport()` in a component) and never read the block themselves:
 *   disabled -> the option stays visible, switched off, with `reason` (H10);
 *   warn     -> enabled, `reason` says not every lab can run it;
 *   ok       -> nothing to say (`all`, `unknown`, `Known: false`, or no block at all).
 */
import type { LabCapabilities, LabSupportValue } from "@/api/exercises/capabilities"
import type { AccessKind, DeviceProfile, ObservationKind } from "@/api/exercises/model"
import { t } from "@/i18n/t"

export type LabKind =
  | { observation: ObservationKind | "file.type" | "file.checksum" }
  | { access: AccessKind }
  | { profile: DeviceProfile }
  | "bootstrap"
  | "checks"
  | "vpnReverse"

export type LabSupport = { state: "ok" | "warn" | "disabled"; reason: string }

const OBSERVATION_WIRE: Record<ObservationKind, keyof LabCapabilities["Observations"]> = {
  file: "file", directory: "directory", process: "process", port: "port", kernelParam: "kernel_param", request: "request", permission: "permission", custom: "custom",
}

function valueOf(caps: LabCapabilities, kind: LabKind): LabSupportValue {
  if (kind === "bootstrap") return caps.Bootstrap
  if (kind === "checks") return caps.Checks
  if (kind === "vpnReverse") return caps.VPNReverse
  if ("observation" in kind) {
    const key = kind.observation === "file.type" || kind.observation === "file.checksum" ? kind.observation : OBSERVATION_WIRE[kind.observation]
    return caps.Observations[key]
  }
  if ("access" in kind) return caps.Access[kind.access]
  return caps.Profiles[kind.profile]
}

const OK: LabSupport = { state: "ok", reason: "" }

export function labSupport(caps: LabCapabilities | null | undefined, kind: LabKind): LabSupport {
  if (!caps || !caps.Known) return OK
  const value = valueOf(caps, kind)
  if (value === "none") return { state: "disabled", reason: t("ed.ui.lab.none") }
  if (value === "some") return { state: "warn", reason: t("ed.ui.lab.some") }
  return OK
}
