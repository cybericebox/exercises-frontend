import { describe, expect, it } from "vitest"
import en from "../../messages/en.json"
import uk from "../../messages/uk.json"
import { deployPhaseLabel, isTerminalPhase } from "@/lib/deployStatus"

const PHASES = ["Pending", "Provisioning", "Ready", "Suspended", "Failed", "Error"]

describe("deployPhaseLabel", () => {
  it("maps every lab phase to Ukrainian text, never the raw English word", () => {
    for (const phase of PHASES) {
      const label = deployPhaseLabel(phase)
      expect(label).not.toBe(phase)
      expect(label).not.toMatch(/^admin\./)
      expect(label).toMatch(/[Ѐ-ӿ]/)
    }
  })

  it("has an English and a Ukrainian message for every phase and for unknown", () => {
    for (const key of [...PHASES.map((p) => p.toLowerCase()), "unknown"]) {
      expect((uk as Record<string, string>)[`admin.exDeploy.phase.${key}`], `uk ${key}`).toBeTruthy()
      expect((en as Record<string, string>)[`admin.exDeploy.phase.${key}`], `en ${key}`).toBeTruthy()
    }
  })

  it("shows an unknown or missing phase as «unknown»", () => {
    expect(deployPhaseLabel("Whatever")).toBe(deployPhaseLabel(undefined))
    expect(deployPhaseLabel("Whatever")).not.toBe("Whatever")
  })
})

describe("isTerminalPhase", () => {
  it("stops on Ready, Failed and Error only", () => {
    expect(PHASES.filter(isTerminalPhase)).toEqual(["Ready", "Failed", "Error"])
    expect(isTerminalPhase(undefined)).toBe(false)
  })
})
