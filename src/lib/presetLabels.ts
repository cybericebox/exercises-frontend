/**
 * presetLabels.ts — the texts of device resource presets, shared by the resource select and the elevation dialog.
 * «блок» is spelled out and declined; the unit is explained once, in the select's help and menu header.
 */
import type { ResourcesConfig } from "@/api/exercises/capabilities"
import { t } from "@/i18n/t"
import { formatCPU, formatMemory, type Preset } from "@/lib/deviceResources"

const plurals = new Intl.PluralRules("uk")

/** `prefix.one|few|many|other` by the Ukrainian plural rule. */
export function pluralKey(prefix: string, count: number): string {
  return `${prefix}.${plurals.select(count)}`
}

/** «8 блоків». */
export function blocksLabel(count: number): string {
  return t(pluralKey("exercises.res.blocks", count), { count })
}

/** «2 CPU · 2Gi». */
export function amountLabel(cpuMillicores: number, memoryBytes: number): string {
  return t("exercises.res.amount", { cpu: formatCPU(cpuMillicores), memory: formatMemory(memoryBytes) })
}

/** «8 блоків · 2 CPU · 2Gi». */
export function blockHint(blocks: number, cpuMillicores: number, memoryBytes: number): string {
  return `${blocksLabel(blocks)} · ${amountLabel(cpuMillicores, memoryBytes)}`
}

/** «Стандартний · 8 блоків · 2 CPU · 2Gi»: one text for the select option and the elevation dialog. */
export function presetOptionLabel(preset: Preset): string {
  return `${t(`exercises.res.preset.${preset.ID}`)} · ${blockHint(preset.Blocks, preset.CPUMillicores, preset.MemoryBytes)}`
}

/** What one block is and what needs no approval. */
export function unitHelp(config: ResourcesConfig): string {
  return t("exercises.res.unitHelp", {
    cpu: formatCPU(config.Block.CPUMillicores),
    memory: formatMemory(config.Block.MemoryBytes),
    upTo: t(pluralKey("exercises.res.blocksUpTo", config.FrameBlocks), { count: config.FrameBlocks }),
    frameCpu: formatCPU(config.Frame.CPUMillicores),
    frameMemory: formatMemory(config.Frame.MemoryBytes),
  })
}
