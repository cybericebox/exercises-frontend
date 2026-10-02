import type { ResourcesConfig } from "@/api/exercises/capabilities"

const MIB = 1024 ** 2

/** The platform's device resources settings as GET /exercises/capabilities returns them. */
export const RESOURCES_CONFIG: ResourcesConfig = {
  Presets: [
    { ID: "micro", CPUMillicores: 25, MemoryBytes: 64 * MIB },
    { ID: "small", CPUMillicores: 50, MemoryBytes: 128 * MIB },
    { ID: "medium", CPUMillicores: 125, MemoryBytes: 512 * MIB },
    { ID: "large", CPUMillicores: 250, MemoryBytes: 1024 * MIB },
  ],
  DefaultPreset: "micro",
  Frame: { CPUMillicores: 250, MemoryBytes: 1024 * MIB },
  Ceiling: { CPUMillicores: 1000, MemoryBytes: 4096 * MIB },
  MaxDevicesPerLab: 32,
  MaxInterfacesPerDevice: 16,
  MaxPortsPerSwitch: 48,
  VariantSpreadWarnPercent: 25,
}
