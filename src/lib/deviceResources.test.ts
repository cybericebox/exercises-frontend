import { describe, expect, it } from "vitest"
import { RESOURCES_CONFIG as config } from "@/test/resourcesConfig"
import { deviceAmount, devicePreset, elevationPresets, formatCPU, formatMemory, outsideFrame, selectedPreset } from "./deviceResources"

const MIB = 1024 ** 2
const device = (ResourcePreset: string) => ({ ResourcePreset })

describe("quantities", () => {
  it("formats them", () => {
    expect(formatCPU(250)).toBe("250m")
    expect(formatCPU(1000)).toBe("1")
    expect(formatMemory(64 * MIB)).toBe("64Mi")
    expect(formatMemory(1536 * MIB)).toBe("1.5Gi")
  })
})

describe("device amount", () => {
  it("is the default preset when none is set", () => {
    expect(selectedPreset(device(""), config)).toBe("micro")
    expect(deviceAmount(device(""), config)).toEqual({ CPUMillicores: 15, MemoryBytes: 64 * MIB })
  })
  it("uses the preset the platform lists", () => {
    expect(deviceAmount(device("medium"), config)).toEqual({ CPUMillicores: 125, MemoryBytes: 512 * MIB })
    expect(devicePreset(device("medium"), config)?.Blocks).toBe(16)
  })
  it("falls back to the default preset for an id the platform does not list", () => {
    expect(devicePreset(device("gigantic"), config)?.ID).toBe("micro")
  })
  it("is outside the frame above its blocks", () => {
    expect(outsideFrame(32, config)).toBe(false)
    expect(outsideFrame(33, config)).toBe(true)
    expect(outsideFrame(64, config)).toBe(true)
  })
  it("offers the blocks above the frame to an elevation", () => {
    expect(elevationPresets(config).map((preset) => preset.ID)).toEqual(["xlarge", "max"])
  })
})
