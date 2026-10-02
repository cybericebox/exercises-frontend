/**
 * deviceResources.ts — helpers over the platform's device resources settings (GET /exercises/capabilities):
 * presets, the frame and the ceiling come from the server, never from constants here.
 *
 * CPU is counted in millicores, memory in bytes. A device is a preset id, or custom CPULimit/MemoryLimit
 * quantities (requests mirror the limits); neither means the default preset. The preset wins over the limits.
 */
import type { ResourcesConfig } from "@/api/exercises/capabilities"
import { quantityValue } from "@/lib/exerciseSchemas"

export type Amount = { CPUMillicores: number; MemoryBytes: number }
type DeviceLike = { ResourcePreset: string; Resources: { CPULimit: string; MemoryLimit: string } }

const MIB = 1024 ** 2

/** CPU quantity ("250m", "0.5") → millicores; null when empty or invalid. */
export function cpuMillis(value: string): number | null {
  const parsed = value ? quantityValue(value) : null
  return parsed === null ? null : Math.round(parsed * 1000)
}

/** Memory quantity ("512Mi", "1Gi") → bytes; null when empty or invalid. */
export function memoryBytes(value: string): number | null {
  const parsed = value ? quantityValue(value) : null
  return parsed === null ? null : Math.round(parsed)
}

export function formatCPU(millis: number): string {
  return millis >= 1000 && millis % 100 === 0 ? `${millis / 1000}` : `${millis}m`
}

export function formatMemory(bytes: number): string {
  const mebibytes = Math.round(bytes / MIB)
  return mebibytes >= 1024 && mebibytes % 128 === 0 ? `${mebibytes / 1024}Gi` : `${mebibytes}Mi`
}

export function cpuQuantity(millis: number): string {
  return `${millis}m`
}

export function memoryQuantity(bytes: number): string {
  return `${Math.round(bytes / MIB)}Mi`
}

export function presetAmount(config: ResourcesConfig, id: string): Amount | null {
  const preset = config.Presets.find((candidate) => candidate.ID === id)
  return preset ? { CPUMillicores: preset.CPUMillicores, MemoryBytes: preset.MemoryBytes } : null
}

/** The preset the device uses, "custom" for its own limits, the default preset when neither is set. */
export function selectedPreset(device: DeviceLike, config: ResourcesConfig): string {
  if (device.ResourcePreset) return device.ResourcePreset
  return device.Resources.CPULimit || device.Resources.MemoryLimit ? "custom" : config.DefaultPreset
}

/** What the device reserves; a missing custom value falls back to the default preset's. */
export function deviceAmount(device: DeviceLike, config: ResourcesConfig): Amount {
  const fallback = presetAmount(config, config.DefaultPreset) ?? { CPUMillicores: 0, MemoryBytes: 0 }
  const preset = device.ResourcePreset ? presetAmount(config, device.ResourcePreset) : null
  if (preset) return preset
  return {
    CPUMillicores: cpuMillis(device.Resources.CPULimit) ?? fallback.CPUMillicores,
    MemoryBytes: memoryBytes(device.Resources.MemoryLimit) ?? fallback.MemoryBytes,
  }
}

export function outsideFrame(amount: Amount, config: ResourcesConfig): boolean {
  return amount.CPUMillicores > config.Frame.CPUMillicores || amount.MemoryBytes > config.Frame.MemoryBytes
}
