import { describe, expect, it } from "vitest"
import { RESOURCES_CONFIG } from "@/test/resourcesConfig"
import { amountLabel, blockHint, blocksLabel, presetOptionLabel, unitHelp } from "./presetLabels"

describe("presetLabels", () => {
  it("spells «блок» out and declines it", () => {
    expect([1, 2, 4, 5, 8, 11, 21, 32].map(blocksLabel)).toEqual(["1 блок", "2 блоки", "4 блоки", "5 блоків", "8 блоків", "11 блоків", "21 блок", "32 блоки"])
  })

  it("never writes the abbreviation «бл.»", () => {
    for (const preset of RESOURCES_CONFIG.Presets) expect(presetOptionLabel(preset)).not.toMatch(/бл\./)
  })

  it("one text for an option: name, blocks, CPU and memory", () => {
    const standard = RESOURCES_CONFIG.Presets.find((preset) => preset.ID === "standard")!
    expect(amountLabel(2000, 2048 * 1024 ** 2)).toBe("2 CPU · 2Gi")
    expect(blockHint(8, 250, 256 * 1024 ** 2)).toBe("8 блоків · 250m CPU · 256Mi")
    expect(presetOptionLabel(standard)).toBe("Стандартний · 8 блоків · 62m CPU · 256Mi")
  })

  it("explains the unit and the approval-free frame from the platform settings", () => {
    expect(unitHelp(RESOURCES_CONFIG)).toBe("1 блок = 7m CPU і 32Mi памʼяті. Без погодження — до 32 блоків (250m CPU, 1Gi). Більше потребує погодження.")
  })
})
