"use client"

import { useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { SelectMenu } from "@/components/ui/select-menu"
import type { NormalizedEndpoint } from "@/api/exercises/versions"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { availableDevicePorts, shortForwardingPort } from "@/lib/topologyPorts"
import { gatewayClashOfLink } from "@/lib/editor/schemas/infra"
import { decodeEndpoint } from "./editor/infra/ConnectionsTable"
import { FieldError, fieldProps } from "./editor/fieldErrors"

type EndpointOption = { value: string; label: string }

/** Port choice for a pair selected on the diagram; no form mutation until confirmation. */
export function TopologyConnectionDialog({ variantIndex, pair, onAdd, onClose }: {
  variantIndex: number
  pair: [string, string] | null
  onAdd: (first: NormalizedEndpoint, second: NormalizedEndpoint) => void
  onClose: () => void
}) {
  const { control } = useFormContext<DraftFormValues>()
  const devices = useWatch({ control, name: `Variants.${variantIndex}.Topology.Devices` }) ?? []
  const connections = useWatch({ control, name: `Variants.${variantIndex}.Topology.Connections` }) ?? []

  function nodeLabel(key: string): string {
    const device = devices.find((candidate) => candidate.ID === key)
    return device?.Name || device?.ID.slice(0, 8) || key
  }

  function optionsForNode(key: string): EndpointOption[] {
    const device = devices.find((candidate) => candidate.ID === key)
    if (!device) return []
    return availableDevicePorts({ Connections: connections }, device).map((port) => ({
      value: `device:${key}:${port}`,
      label: shortForwardingPort(port),
    }))
  }

  return <Dialog open={pair !== null}>
    <DialogContent className="max-w-md gap-3 p-4" onOverlayPointerDown={onClose} onPointerDownOutside={(event) => {
      const target = event.detail.originalEvent.target
      if (target instanceof Node && event.currentTarget instanceof Node && event.currentTarget.contains(target)) {
        event.preventDefault()
        return
      }
      onClose()
    }} onEscapeKeyDown={(event) => event.preventDefault()}>
      <DialogHeader><DialogTitle className="text-base">{t("admin.exTopo.canvasConnect")}</DialogTitle>
        <DialogDescription className="sr-only">{t("admin.exTopo.canvasChooseInterfaces")}</DialogDescription></DialogHeader>
      {pair && <CanvasConnectionChoice key={pair.join(":")}
        firstLabel={nodeLabel(pair[0])} secondLabel={nodeLabel(pair[1])}
        firstOptions={optionsForNode(pair[0])} secondOptions={optionsForNode(pair[1])}
        clashOf={(first, second) => { const a = decodeEndpoint(first); const b = decodeEndpoint(second); return gatewayClashOfLink({ Devices: devices, Connections: connections }, a, b) }}
        onAdd={(first, second) => onAdd(decodeEndpoint(first), decodeEndpoint(second))}
        onCancel={onClose} />}
    </DialogContent>
  </Dialog>
}

function CanvasConnectionChoice({ firstLabel, secondLabel, firstOptions, secondOptions, clashOf, onAdd, onCancel }: {
  firstLabel: string
  secondLabel: string
  firstOptions: EndpointOption[]
  secondOptions: EndpointOption[]
  /** The gateway that the chosen link would put into one network with another gateway, or null. */
  clashOf: (first: string, second: string) => string | null
  onAdd: (first: string, second: string) => void
  onCancel: () => void
}) {
  const [first, setFirst] = useState(firstOptions[0]?.value ?? "")
  const [second, setSecond] = useState(secondOptions[0]?.value ?? "")
  if (firstOptions.length === 0 || secondOptions.length === 0) return <div className="flex items-center justify-between gap-3">
    <p role="status" className="text-sm text-muted-foreground">{t("admin.exTopo.noFreePort")}</p>
    <Button type="button" variant="outline" size="sm" onClick={onCancel}>{t("admin.exTopo.canvasCancel")}</Button>
  </div>
  const clash = first && second ? clashOf(first, second) : null
  // The refusal belongs to the pair: both port selects are marked and described by the reason shown under them.
  const clashAria = fieldProps("canvas-connection", clash ?? undefined)
  return <div className="space-y-4">
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <div className="min-w-0 space-y-1"><HoverTooltip text={firstLabel} className="block min-w-0"><p className="truncate text-xs font-medium text-muted-foreground">{firstLabel}</p></HoverTooltip>
        <SelectMenu value={first} onChange={setFirst} options={firstOptions} ariaLabel={t("admin.exTopo.endpoint.first")} aria-invalid={clashAria["aria-invalid"]} aria-describedby={clashAria["aria-describedby"]} portalled={false} modal={false} sideOffset={8}
          placeholder={t("admin.exTopo.endpoint.placeholder")} className="h-9 w-full min-w-0 text-sm" menuClassName="max-h-60 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain" />
      </div>
      <div className="min-w-0 space-y-1"><HoverTooltip text={secondLabel} className="block min-w-0"><p className="truncate text-xs font-medium text-muted-foreground">{secondLabel}</p></HoverTooltip>
        <SelectMenu value={second} onChange={setSecond} options={secondOptions} ariaLabel={t("admin.exTopo.endpoint.second")} aria-invalid={clashAria["aria-invalid"]} aria-describedby={clashAria["aria-describedby"]} portalled={false} modal={false} sideOffset={8}
          placeholder={t("admin.exTopo.endpoint.placeholder")} className="h-9 w-full min-w-0 text-sm" menuClassName="max-h-60 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain" />
      </div>
    </div>
    {clash && <FieldError path="canvas-connection" message={t("ed.c.gw.networkTaken", { name: clash })} />}
    <div className="flex justify-end gap-2">
      <Button type="button" variant="outline" size="sm" onClick={onCancel}>{t("admin.exTopo.canvasCancel")}</Button>
      <Button type="button" size="sm" disabled={!first || !second || clash !== null} onClick={() => onAdd(first, second)}>{t("admin.exTopo.canvasConnect")}</Button>
    </div>
  </div>
}
