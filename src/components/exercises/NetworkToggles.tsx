"use client"

import { Controller, useFormContext, useWatch } from "react-hook-form"
import { t } from "@/i18n/t"
import { Switch } from "@/components/ui/switch"
import { FieldHelp } from "@/components/ui/field-help"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { RemoveAction } from "./RemoveAction"
import { Plus, TriangleAlert } from "lucide-react"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import type { DHCPRangeDTO } from "@/api/exercises/versions"

function nextFreeRange(ranges: DHCPRangeDTO[]): DHCPRangeDTO | null {
  if (ranges.length === 0) return { Start: 2, End: 254 }
  const used = new Set(ranges.flatMap((range) => Array.from({ length: Math.max(0, Math.min(range.End, 254) - Math.max(range.Start, 2) + 1) }, (_, i) => Math.max(range.Start, 2) + i)))
  for (let host = 2; host <= 254; host += 1) {
    if (used.has(host)) continue
    let end = host
    while (end < 254 && end - host < 49 && !used.has(end + 1)) end += 1
    return { Start: host, End: end }
  }
  return null
}

/** NetworkToggles — VPN/Internet: Enabled + DHCP per variant. */
export function NetworkToggles({
  variantIndex,
  disabled,
  network,
  showEnabled = true,
}: {
  variantIndex: number
  disabled: boolean
  network?: "VPN" | "Internet"
  showEnabled?: boolean
}) {
  const { control } = useFormContext<DraftFormValues>()
  const [vpnEnabled, vpnDhcp, internetEnabled, internetDhcp] = useWatch({ control, name: [
    `Variants.${variantIndex}.Topology.VPN.Enabled`,
    `Variants.${variantIndex}.Topology.VPN.DHCP`,
    `Variants.${variantIndex}.Topology.Internet.Enabled`,
    `Variants.${variantIndex}.Topology.Internet.DHCP`,
  ] })
  const showDhcpWarning = vpnEnabled && vpnDhcp && internetEnabled && internetDhcp
  const nets = [
    { key: "VPN", label: t("admin.exTopo.vpn") },
    { key: "Internet", label: t("admin.exTopo.internet") },
  ] as const

  return (
    <div className="divide-y divide-border">
      {nets.filter((net) => !network || net.key === network).map((net) => (
        <NetworkToggle key={net.key} variantIndex={variantIndex} disabled={disabled} network={net.key} label={net.label} showEnabled={showEnabled} showDhcpWarning={showDhcpWarning} />
      ))}
    </div>
  )
}

function NetworkToggle({ variantIndex, disabled, network, label, showEnabled, showDhcpWarning }: {
  variantIndex: number
  disabled: boolean
  network: "VPN" | "Internet"
  label: string
  showEnabled: boolean
  showDhcpWarning: boolean
}) {
  const { control, setValue } = useFormContext<DraftFormValues>()
  const enabled = useWatch({ control, name: `Variants.${variantIndex}.Topology.${network}.Enabled` })
  const dhcp = useWatch({ control, name: `Variants.${variantIndex}.Topology.${network}.DHCP` })
  const rangesName = `Variants.${variantIndex}.Topology.${network}.DHCPRanges` as const
  const ranges = useWatch({ control, name: rangesName }) ?? []
  function ensureRange() {
    if (ranges.length === 0) setValue(rangesName, [{ Start: 2, End: 254 }], { shouldDirty: true })
  }
  const help = network === "VPN" ? "admin.exTopo.vpnHelp" : "admin.exTopo.internetHelp"
  const dhcpLabel = network === "VPN" ? "admin.exTopo.vpnDhcp" : "admin.exTopo.internetDhcp"
  return <div className="min-w-0 space-y-2 py-3 first:pt-0 last:pb-0">
    {showEnabled && <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-1.5"><span className="text-sm font-medium">{label}</span><FieldHelp text={t(help)} /></div>
      <Controller control={control} name={`Variants.${variantIndex}.Topology.${network}.Enabled`}
        render={({ field }) => <Switch aria-label={label} checked={field.value} onCheckedChange={(value) => { if (value && dhcp) ensureRange(); field.onChange(value) }} disabled={disabled} />} />
    </div>}
    {enabled && <div className="flex items-center justify-between gap-4 border-t border-border pt-2">
      <div className="flex items-center gap-1.5"><span className="text-xs text-muted-foreground">DHCP</span><FieldHelp text={t("admin.exTopo.dhcpHelp")} /></div>
      <Controller control={control} name={`Variants.${variantIndex}.Topology.${network}.DHCP`}
        render={({ field }) => <Switch aria-label={t(dhcpLabel)} checked={field.value} onCheckedChange={(value) => { if (value) ensureRange(); field.onChange(value) }} disabled={disabled} />} />
    </div>}
    {enabled && dhcp && <Controller control={control} name={rangesName}
      render={({ field, fieldState }) => {
        const ranges = field.value ?? []
        const next = nextFreeRange(ranges)
        return <div className="space-y-2 border-t border-border pt-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5"><span className="text-xs font-medium">{t("admin.exTopo.dhcp.ranges")}</span><FieldHelp text={t("admin.exTopo.dhcp.rangesHelp")} /></div>
            <Button type="button" variant="outline" size="sm" disabled={disabled || !next} onClick={() => next && field.onChange([...ranges, next])}>
              <Plus className="mr-1 h-3.5 w-3.5" />{t("admin.exTopo.dhcp.addRange")}
            </Button>
          </div>
          {ranges.length === 0 && <p role="alert" className="text-xs text-destructive">{t("admin.ex.val.dhcpRangesRequired")}</p>}
          {ranges.map((range, index) => <div key={index} className="flex items-center gap-2">
            <span className="shrink-0 text-xs text-muted-foreground">.</span>
            <Input type="number" min={2} max={254} step={1} value={range.Start} disabled={disabled} aria-label={`${t("admin.exTopo.dhcp.rangeStart")} ${index + 1}`}
              className="h-9 min-w-0" onChange={(event) => field.onChange(ranges.map((item, i) => i === index ? { ...item, Start: Number(event.target.value) } : item))} />
            <span aria-hidden="true" className="text-xs text-muted-foreground">—</span>
            <span className="shrink-0 text-xs text-muted-foreground">.</span>
            <Input type="number" min={2} max={254} step={1} value={range.End} disabled={disabled} aria-label={`${t("admin.exTopo.dhcp.rangeEnd")} ${index + 1}`}
              className="h-9 min-w-0" onChange={(event) => field.onChange(ranges.map((item, i) => i === index ? { ...item, End: Number(event.target.value) } : item))} />
            {!disabled && <RemoveAction ariaLabel={`${t("admin.exTopo.dhcp.removeRange")} ${index + 1}`} onClick={() => field.onChange(ranges.filter((_, i) => i !== index))} className="h-9 w-9 shrink-0" />}
          </div>)}
          {fieldState.error?.message && <p role="alert" className="text-xs text-destructive">{fieldState.error.message}</p>}
        </div>
      }} />}
    {enabled && dhcp && network === "Internet" && <Controller control={control} name={`Variants.${variantIndex}.Topology.Internet.DNS`}
      render={({ field, fieldState }) => <div className="space-y-1 border-t border-border pt-2">
        <div className="flex items-center gap-1.5"><label htmlFor={`internet-dhcp-dns-${variantIndex}`} className="text-xs font-medium">{t("admin.exTopo.dhcp.dns")}</label><FieldHelp text={t("admin.exTopo.dhcp.dnsHelp")} /></div>
        <Input id={`internet-dhcp-dns-${variantIndex}`} value={field.value ?? ""} onChange={field.onChange} disabled={disabled} placeholder="1.1.1.1" className="h-9" />
        {fieldState.error?.message && <p role="alert" className="text-xs text-destructive">{fieldState.error.message}</p>}
      </div>} />}
    {enabled && <dl className="space-y-1.5 text-xs leading-5 text-muted-foreground">
      {(["enabled", "disabled"] as const).map((state) => <div key={state} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2">
        <dt className="font-medium text-foreground">{t(`admin.exTopo.dhcp.${state}Label`)}</dt>
        <dd className="min-w-0">{t(state === "enabled"
          ? `admin.exTopo.dhcp.enabled.${network === "VPN" ? "vpn" : "internet"}`
          : "admin.exTopo.dhcp.disabled")}</dd>
      </div>)}
    </dl>}
    {showDhcpWarning && <div role="note" className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-2.5 py-2 text-xs leading-5 text-amber-900 dark:text-amber-200">
      <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <span>
        <span className="block">{t("admin.exTopo.dhcp.warning")}</span>
        <span className="block">{t("admin.exTopo.dhcp.warningConsequence")}</span>
      </span>
    </div>}
  </div>
}
