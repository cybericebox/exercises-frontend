/**
 * deviceResources.ts — the device resources model: presets, the frame, the platform
 * ceiling, per-task totals and the elevation gate.
 *
 * CPU is counted in millicores, memory in MiB. A preset sets request = limit.
 * Empty resources mean the default preset («Мікро»). The frame is the largest preset;
 * values above it need an approved elevation, up to the ceiling.
 */
import { quantityValue } from "@/lib/exerciseSchemas"
import type { DeviceResourcesDTO } from "@/api/exercises/versions"

export type PresetId = "micro" | "small" | "medium" | "large"
export type ResourcePreset = { id: PresetId; cpu: number; memory: number }

export const RESOURCE_PRESETS: ResourcePreset[] = [
  { id: "micro", cpu: 25, memory: 64 },
  { id: "small", cpu: 50, memory: 128 },
  { id: "medium", cpu: 125, memory: 512 },
  { id: "large", cpu: 250, memory: 1024 },
]
export const DEFAULT_PRESET = RESOURCE_PRESETS[0]
export const FRAME = { cpu: 250, memory: 1024 }
export const CEILING = { cpu: 1000, memory: 4096 }
/** Variants of one task differing by more than this share of the larger one trigger a warning. */
export const VARIANT_SPREAD = 0.25

export type Amount = { cpu: number; memory: number }
type ResourceFields = Partial<DeviceResourcesDTO>

/** CPU quantity ("250m", "0.5") → millicores; null when empty or invalid. */
export function cpuMillis(value: string | undefined): number | null {
  const parsed = value ? quantityValue(value) : null
  return parsed === null ? null : Math.round(parsed * 1000)
}

/** Memory quantity ("512Mi", "1Gi") → MiB; null when empty or invalid. */
export function memoryMiB(value: string | undefined): number | null {
  const parsed = value ? quantityValue(value) : null
  return parsed === null ? null : Math.round((parsed / 1024 ** 2) * 100) / 100
}

export function formatCPU(millis: number): string {
  return millis >= 1000 && millis % 100 === 0 ? `${millis / 1000}` : `${millis}m`
}

export function formatMemory(mebibytes: number): string {
  return mebibytes >= 1024 && mebibytes % 128 === 0 ? `${mebibytes / 1024}Gi` : `${mebibytes}Mi`
}

export function cpuQuantity(millis: number): string {
  return `${millis}m`
}

export function memoryQuantity(mebibytes: number): string {
  return `${mebibytes}Mi`
}

/** What the device reserves: the limit, else the request, else the default preset. */
export function deviceAmount(resources: ResourceFields | undefined): Amount {
  return {
    cpu: cpuMillis(resources?.CPULimit) ?? cpuMillis(resources?.CPURequest) ?? DEFAULT_PRESET.cpu,
    memory: memoryMiB(resources?.MemoryLimit) ?? memoryMiB(resources?.MemoryRequest) ?? DEFAULT_PRESET.memory,
  }
}

/** The preset the values equal (request = limit), "custom" otherwise. */
export function presetOf(resources: ResourceFields | undefined): PresetId | "custom" {
  const empty = !resources || !Object.values(resources).some(Boolean)
  if (empty) return DEFAULT_PRESET.id
  const request = { cpu: cpuMillis(resources.CPURequest), memory: memoryMiB(resources.MemoryRequest) }
  const limit = { cpu: cpuMillis(resources.CPULimit), memory: memoryMiB(resources.MemoryLimit) }
  if (request.cpu !== limit.cpu || request.memory !== limit.memory) return "custom"
  return RESOURCE_PRESETS.find((preset) => preset.cpu === limit.cpu && preset.memory === limit.memory)?.id ?? "custom"
}

export function presetResources(preset: ResourcePreset): Required<DeviceResourcesDTO> {
  const cpu = cpuQuantity(preset.cpu)
  const memory = memoryQuantity(preset.memory)
  return { CPURequest: cpu, CPULimit: cpu, MemoryRequest: memory, MemoryLimit: memory }
}

export function customResources(cpu: string, memory: string): Required<DeviceResourcesDTO> {
  return { CPURequest: cpu, CPULimit: cpu, MemoryRequest: memory, MemoryLimit: memory }
}

export function outsideFrame(amount: Amount): boolean {
  return amount.cpu > FRAME.cpu || amount.memory > FRAME.memory
}

export function aboveCeiling(amount: Amount): boolean {
  return amount.cpu > CEILING.cpu || amount.memory > CEILING.memory
}

// ── Totals ─────────────────────────────────────────────────────────────────────

type TopologyLike = { Devices: { ID: string; Name: string; Type: string; Resources: ResourceFields }[] }
type VariantLike = { Topology: TopologyLike }

export type Totals = Amount & { devices: number }

/** Sum over the devices of one variant; switches and hubs count as devices but reserve nothing. */
export function variantTotals(variant: VariantLike): Totals {
  let cpu = 0
  let memory = 0
  for (const device of variant.Topology.Devices) {
    if (device.Type !== "container") continue
    const amount = deviceAmount(device.Resources)
    cpu += amount.cpu
    memory += amount.memory
  }
  return { cpu, memory, devices: variant.Topology.Devices.length }
}

export type TaskTotals = { min: Totals; max: Totals; variants: number }

/** Min–max over the variants; planning reserves the largest one. */
export function taskTotals(variants: VariantLike[]): TaskTotals {
  const all = variants.map(variantTotals)
  const pick = (field: keyof Totals, fn: (...values: number[]) => number) => fn(...all.map((total) => total[field]))
  const empty: Totals = { cpu: 0, memory: 0, devices: 0 }
  if (all.length === 0) return { min: empty, max: empty, variants: 0 }
  return {
    min: { cpu: pick("cpu", Math.min), memory: pick("memory", Math.min), devices: pick("devices", Math.min) },
    max: { cpu: pick("cpu", Math.max), memory: pick("memory", Math.max), devices: pick("devices", Math.max) },
    variants: all.length,
  }
}

/** True when the variants differ by more than VARIANT_SPREAD in CPU or memory. */
export function variantsDiffer(totals: TaskTotals): boolean {
  if (totals.variants < 2) return false
  const spread = (min: number, max: number) => max > 0 && (max - min) / max > VARIANT_SPREAD
  return spread(totals.min.cpu, totals.max.cpu) || spread(totals.min.memory, totals.max.memory)
}

// ── Elevation gate ─────────────────────────────────────────────────────────────

export type ElevationStatus = "none" | "pending" | "approved" | "rejected"
export type ElevationValue = { DeviceID: string; DeviceName?: string; CPU: string; Memory: string }

/** An outside-the-frame device and whether an approval covers it. */
export type FrameIssue = {
  variantIndex: number
  deviceID: string
  deviceName: string
  amount: Amount
  tooLarge: boolean
  covered: boolean
}

/** An approval covers a device while no value is above the approved one (lowering keeps it). */
export function coveredBy(amount: Amount, approved: ElevationValue | undefined): boolean {
  if (!approved) return false
  const cpu = cpuMillis(approved.CPU)
  const memory = memoryMiB(approved.Memory)
  return cpu !== null && memory !== null && amount.cpu <= cpu && amount.memory <= memory
}

export function frameIssues(variants: VariantLike[], approved: ElevationValue[]): FrameIssue[] {
  const issues: FrameIssue[] = []
  variants.forEach((variant, variantIndex) => {
    for (const device of variant.Topology.Devices) {
      if (device.Type !== "container") continue
      const amount = deviceAmount(device.Resources)
      if (!outsideFrame(amount)) continue
      issues.push({
        variantIndex, deviceID: device.ID, deviceName: device.Name, amount,
        tooLarge: aboveCeiling(amount),
        covered: coveredBy(amount, approved.find((entry) => entry.DeviceID === device.ID)),
      })
    }
  })
  return issues
}

/** Publishing waits for every outside-the-frame device to be covered by an approval. */
export function publishBlocked(issues: FrameIssue[]): boolean {
  return issues.some((issue) => !issue.covered)
}
