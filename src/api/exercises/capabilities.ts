import { apiGet } from "@/api/client"

export type ResourceAmount = { CPUMillicores: number; MemoryBytes: number }

/**
 * The platform's device resources settings. A device is a whole number of blocks (Block is one block);
 * there is no custom size. Presets are ascending by Blocks; a device above FrameBlocks needs an approved
 * elevation, up to CeilingBlocks.
 */
export type ResourcesConfig = {
  Block: ResourceAmount
  Presets: ({ ID: string; Blocks: number } & ResourceAmount)[]
  DefaultPreset: string
  FrameBlocks: number
  CeilingBlocks: number
  Frame: ResourceAmount
  Ceiling: ResourceAmount
  MaxDevicesPerLab: number
  MaxInterfacesPerDevice: number
  MaxPortsPerSwitch: number
  /** Variants of one task differing by more than this percent trigger a warning. */
  VariantSpreadWarnPercent: number
}

export type ExerciseCapabilities = {
  Laboratories: boolean
  /** How many test labs one user may run at once (older servers: one). */
  MaxActiveTestDeploys?: number
  /** The platform can keep a container's state across an unplanned restart (device Persistence). */
  DevicePersistence?: boolean
  Resources: ResourcesConfig
}

/** Editor-only capability: does not expose agent inventory or monitoring. */
export function getExerciseCapabilities(): Promise<ExerciseCapabilities> {
  return apiGet<ExerciseCapabilities>("/api/exercises/capabilities")
}
