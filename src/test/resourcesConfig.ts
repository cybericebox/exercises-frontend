import type { ResourcesConfig } from "@/api/exercises/capabilities"

const MIB = 1024 ** 2

/** The platform's device resources settings as GET /exercises/capabilities returns them (a block is the smallest size, 32Mi / 7m). */
export const RESOURCES_CONFIG: ResourcesConfig = {
  Block: { CPUMillicores: 7, MemoryBytes: 32 * MIB },
  Presets: [
    { ID: "nano", Blocks: 1, CPUMillicores: 7, MemoryBytes: 32 * MIB },
    { ID: "micro", Blocks: 2, CPUMillicores: 15, MemoryBytes: 64 * MIB },
    { ID: "small", Blocks: 4, CPUMillicores: 31, MemoryBytes: 128 * MIB },
    { ID: "standard", Blocks: 8, CPUMillicores: 62, MemoryBytes: 256 * MIB },
    { ID: "medium", Blocks: 16, CPUMillicores: 125, MemoryBytes: 512 * MIB },
    { ID: "large", Blocks: 32, CPUMillicores: 250, MemoryBytes: 1024 * MIB },
    { ID: "xlarge", Blocks: 64, CPUMillicores: 500, MemoryBytes: 2048 * MIB },
    { ID: "max", Blocks: 128, CPUMillicores: 1000, MemoryBytes: 4096 * MIB },
  ],
  DefaultPreset: "micro",
  FrameBlocks: 32,
  CeilingBlocks: 128,
  Frame: { CPUMillicores: 250, MemoryBytes: 1024 * MIB },
  Ceiling: { CPUMillicores: 1000, MemoryBytes: 4096 * MIB },
  MaxDevicesPerLab: 32,
  MaxInterfacesPerDevice: 16,
  MaxPortsPerSwitch: 48,
  VariantSpreadWarnPercent: 25,
}
