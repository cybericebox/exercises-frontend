/**
 * deviceResources.ts — helpers over the platform's device resources settings (GET /exercises/capabilities):
 * the block, the presets, the frame and the ceiling come from the server, never from constants here.
 *
 * CPU is counted in millicores, memory in bytes. A device is a preset (a whole number of blocks); an unset
 * preset is the default one. There is no custom size.
 */
import type { ResourcesConfig } from "@/api/exercises/capabilities"

export type Amount = { CPUMillicores: number; MemoryBytes: number }
type DeviceLike = { ResourcePreset: string }
export type Preset = ResourcesConfig["Presets"][number]

const MIB = 1024 ** 2

export function formatCPU(millis: number): string {
  return millis >= 1000 && millis % 100 === 0 ? `${millis / 1000}` : `${millis}m`
}

export function formatMemory(bytes: number): string {
  const mebibytes = Math.round(bytes / MIB)
  return mebibytes >= 1024 && mebibytes % 128 === 0 ? `${mebibytes / 1024}Gi` : `${mebibytes}Mi`
}

export function presetById(config: ResourcesConfig, id: string): Preset | null {
  return config.Presets.find((candidate) => candidate.ID === id) ?? null
}

/** The preset the device uses: its own, else the default one; null when the platform offers neither. */
export function devicePreset(device: DeviceLike, config: ResourcesConfig): Preset | null {
  return presetById(config, device.ResourcePreset) ?? presetById(config, config.DefaultPreset)
}

/** The preset id the picker shows as chosen. */
export function selectedPreset(device: DeviceLike, config: ResourcesConfig): string {
  return device.ResourcePreset || config.DefaultPreset
}

/** What the device reserves. */
export function deviceAmount(device: DeviceLike, config: ResourcesConfig): Amount {
  const preset = devicePreset(device, config)
  return preset ? { CPUMillicores: preset.CPUMillicores, MemoryBytes: preset.MemoryBytes } : { CPUMillicores: 0, MemoryBytes: 0 }
}

/** A block count above the frame needs an approved elevation. */
export function outsideFrame(blocks: number, config: ResourcesConfig): boolean {
  return blocks > config.FrameBlocks
}

/** The presets an elevation may ask for: the ones above the frame. */
export function elevationPresets(config: ResourcesConfig): Preset[] {
  return config.Presets.filter((preset) => preset.Blocks > config.FrameBlocks)
}
