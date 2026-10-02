import { describe, expect, it } from "vitest"
import {
  coveredBy, deviceAmount, frameIssues, presetOf, publishBlocked, taskTotals, variantsDiffer, type ElevationValue,
} from "./deviceResources"

type Res = { CPURequest?: string; CPULimit?: string; MemoryRequest?: string; MemoryLimit?: string }
const device = (id: string, resources: Res, type = "container") => ({ ID: id, Name: id, Type: type, Resources: resources })
const same = (cpu: string, memory: string): Res => ({ CPURequest: cpu, CPULimit: cpu, MemoryRequest: memory, MemoryLimit: memory })
const variant = (...devices: ReturnType<typeof device>[]) => ({ Topology: { Devices: devices } })

describe("presetOf", () => {
  it("treats empty resources as the default preset", () => {
    expect(presetOf({})).toBe("micro")
    expect(presetOf(undefined)).toBe("micro")
  })
  it("recognises each preset and custom values", () => {
    expect(presetOf(same("50m", "128Mi"))).toBe("small")
    expect(presetOf(same("0.125", "512Mi"))).toBe("medium")
    expect(presetOf(same("250m", "1Gi"))).toBe("large")
    expect(presetOf(same("300m", "1Gi"))).toBe("custom")
    expect(presetOf({ CPURequest: "25m", CPULimit: "50m", MemoryRequest: "64Mi", MemoryLimit: "64Mi" })).toBe("custom")
  })
})

describe("totals", () => {
  it("sums containers and counts every device; empty resources are micro", () => {
    const totals = taskTotals([variant(device("a", same("125m", "512Mi")), device("b", {}), device("sw", {}, "unmanaged-switch"))])
    expect(totals.max).toEqual({ cpu: 150, memory: 576, devices: 3 })
    expect(totals.min).toEqual(totals.max)
  })
  it("gives the min–max over variants", () => {
    const totals = taskTotals([variant(device("a", same("250m", "1Gi"))), variant(device("a", same("50m", "128Mi")))])
    expect(totals.min.cpu).toBe(50)
    expect(totals.max.memory).toBe(1024)
  })
  it("warns only when variants differ by more than 25%", () => {
    expect(variantsDiffer(taskTotals([variant(device("a", same("250m", "1Gi"))), variant(device("a", same("250m", "1Gi")))]))).toBe(false)
    expect(variantsDiffer(taskTotals([variant(device("a", same("250m", "1Gi"))), variant(device("a", same("200m", "1Gi")))]))).toBe(false)
    expect(variantsDiffer(taskTotals([variant(device("a", same("250m", "1Gi"))), variant(device("a", same("50m", "128Mi")))]))).toBe(true)
    expect(variantsDiffer(taskTotals([variant(device("a", same("250m", "1Gi")))]))).toBe(false)
  })
})

describe("elevation gate", () => {
  const big = variant(device("big", same("500m", "2Gi")))
  const approval = (cpu: string, memory: string): ElevationValue[] => [{ DeviceID: "big", CPU: cpu, Memory: memory }]

  it("ignores devices inside the frame", () => {
    expect(frameIssues([variant(device("a", same("250m", "1Gi")))], [])).toEqual([])
  })
  it("blocks publishing until the device is covered", () => {
    expect(publishBlocked(frameIssues([big], []))).toBe(true)
    expect(publishBlocked(frameIssues([big], approval("500m", "2Gi")))).toBe(false)
  })
  it("keeps an approval when values go down and drops it when any value goes up", () => {
    expect(frameIssues([variant(device("big", same("400m", "1536Mi")))], approval("500m", "2Gi"))[0].covered).toBe(true)
    expect(frameIssues([variant(device("big", same("600m", "2Gi")))], approval("500m", "2Gi"))[0].covered).toBe(false)
    expect(frameIssues([variant(device("big", same("500m", "3Gi")))], approval("500m", "2Gi"))[0].covered).toBe(false)
  })
  it("flags values above the platform ceiling", () => {
    expect(frameIssues([variant(device("big", same("2", "2Gi")))], [])[0].tooLarge).toBe(true)
    expect(frameIssues([variant(device("big", same("1", "4Gi")))], [])[0].tooLarge).toBe(false)
  })
  it("coveredBy needs an approval", () => {
    expect(coveredBy(deviceAmount(same("500m", "2Gi")), undefined)).toBe(false)
  })
})
