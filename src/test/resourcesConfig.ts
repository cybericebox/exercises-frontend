import type { ResourcesConfig } from "@/api/exercises/capabilities"

const MIB = 1024 ** 2

/** The platform's device resources settings as GET /exercises/capabilities returns them (one block = 64Mi / 15.6m). */
export const RESOURCES_CONFIG: ResourcesConfig = {
  Block: { CPUMillicores: 16, MemoryBytes: 64 * MIB },
  Presets: [
    { ID: "micro", Blocks: 1, CPUMillicores: 16, MemoryBytes: 64 * MIB },
    { ID: "small", Blocks: 2, CPUMillicores: 32, MemoryBytes: 128 * MIB },
    { ID: "medium", Blocks: 8, CPUMillicores: 125, MemoryBytes: 512 * MIB },
    { ID: "large", Blocks: 16, CPUMillicores: 250, MemoryBytes: 1024 * MIB },
    { ID: "xlarge", Blocks: 32, CPUMillicores: 500, MemoryBytes: 2048 * MIB },
    { ID: "huge", Blocks: 64, CPUMillicores: 1000, MemoryBytes: 4096 * MIB },
  ],
  DefaultPreset: "micro",
  FrameBlocks: 16,
  CeilingBlocks: 64,
  Frame: { CPUMillicores: 250, MemoryBytes: 1024 * MIB },
  Ceiling: { CPUMillicores: 1000, MemoryBytes: 4096 * MIB },
  MaxDevicesPerLab: 32,
  MaxInterfacesPerDevice: 16,
  MaxPortsPerSwitch: 48,
  VariantSpreadWarnPercent: 25,
}
