import { describe, expect, it } from "vitest"
import { RESOURCES_CONFIG as config } from "@/test/resourcesConfig"
import { cpuMillis, deviceAmount, formatCPU, formatMemory, memoryBytes, outsideFrame, selectedPreset } from "./deviceResources"

const MIB = 1024 ** 2
const device = (ResourcePreset: string, CPULimit = "", MemoryLimit = "") => ({ ResourcePreset, Resources: { CPULimit, MemoryLimit } })

describe("quantities", () => {
  it("parses CPU to millicores and memory to bytes", () => {
    expect(cpuMillis("250m")).toBe(250)
    expect(cpuMillis("0.5")).toBe(500)
    expect(cpuMillis("")).toBeNull()
    expect(memoryBytes("512Mi")).toBe(512 * MIB)
    expect(memoryBytes("1Gi")).toBe(1024 * MIB)
  })
  it("formats them", () => {
    expect(formatCPU(250)).toBe("250m")
    expect(formatCPU(1000)).toBe("1")
    expect(formatMemory(64 * MIB)).toBe("64Mi")
    expect(formatMemory(1536 * MIB)).toBe("1.5Gi")
  })
})

describe("device amount", () => {
  it("is the default preset when neither a preset nor limits are set", () => {
    expect(selectedPreset(device(""), config)).toBe("micro")
    expect(deviceAmount(device(""), config)).toEqual({ CPUMillicores: 25, MemoryBytes: 64 * MIB })
  })
  it("uses the preset the platform lists, and the preset wins over limits", () => {
    expect(deviceAmount(device("medium"), config)).toEqual({ CPUMillicores: 125, MemoryBytes: 512 * MIB })
    expect(selectedPreset(device("medium", "900m", "2Gi"), config)).toBe("medium")
    expect(deviceAmount(device("medium", "900m", "2Gi"), config).CPUMillicores).toBe(125)
  })
  it("uses custom limits, a missing one falls back to the default preset", () => {
    expect(selectedPreset(device("", "300m"), config)).toBe("custom")
    expect(deviceAmount(device("", "300m", "2Gi"), config)).toEqual({ CPUMillicores: 300, MemoryBytes: 2048 * MIB })
    expect(deviceAmount(device("", "300m"), config).MemoryBytes).toBe(64 * MIB)
  })
  it("is outside the frame above either value", () => {
    expect(outsideFrame({ CPUMillicores: 250, MemoryBytes: 1024 * MIB }, config)).toBe(false)
    expect(outsideFrame({ CPUMillicores: 251, MemoryBytes: 64 * MIB }, config)).toBe(true)
    expect(outsideFrame({ CPUMillicores: 25, MemoryBytes: 1025 * MIB }, config)).toBe(true)
  })
})
