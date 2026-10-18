"use client"

import type { ResourcesConfig } from "@/api/exercises/capabilities"
import { SelectMenu, type SelectMenuOption } from "@/components/ui/select-menu"
import { t } from "@/i18n/t"
import { outsideFrame, type Preset } from "@/lib/deviceResources"
import { amountLabel, blocksLabel, presetOptionLabel, unitHelp } from "@/lib/presetLabels"

const APPROVAL = "text-[var(--ib-warn)]"

function option(preset: Preset, config: ResourcesConfig): SelectMenuOption {
  const name = t(`exercises.res.preset.${preset.ID}`)
  const amount = amountLabel(preset.CPUMillicores, preset.MemoryBytes)
  const blocks = blocksLabel(preset.Blocks)
  const approval = outsideFrame(preset.Blocks, config)
  return {
    value: preset.ID,
    label: presetOptionLabel(preset),
    content: <span data-preset-option={preset.ID} className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3">
      <span className="truncate font-medium">{name}</span>
      <span className="text-right font-mono text-xs tabular-nums">{amount}</span>
      <span className="text-xs text-muted-foreground">{blocks}</span>
      {approval ? <span data-needs-approval className={`text-right text-xs ${APPROVAL}`}>{t("exercises.res.tag.approval")}</span> : <span />}
    </span>,
    triggerContent: <span className="flex min-w-0 items-baseline gap-2">
      <span className="shrink-0">{name}</span>
      <span className="truncate text-muted-foreground">{blocks} · {amount}</span>
      {approval && <span data-needs-approval className={`shrink-0 text-xs ${APPROVAL}`}>{t("exercises.res.tag.approval")}</span>}
    </span>,
  }
}

/**
 * The block size of a device as one select: name, blocks, CPU and memory per option, the unit and the
 * approval-free frame explained once in the menu header (and in the label's help), blocks above the frame tagged.
 */
export function ResourceSelect({ value, onChange, config, disabled, ariaLabel }: {
  value: string
  onChange: (presetId: string) => void
  config: ResourcesConfig
  disabled: boolean
  ariaLabel: string
}) {
  return <SelectMenu value={value} onChange={onChange} disabled={disabled} ariaLabel={ariaLabel}
    options={config.Presets.map((preset) => option(preset, config))}
    menuHeader={unitHelp(config)} className="h-10 w-full" menuClassName="w-[22rem] max-w-[90vw]" />
}
