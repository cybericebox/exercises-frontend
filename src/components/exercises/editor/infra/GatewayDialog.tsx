"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { Controller, useFormContext, useWatch } from "react-hook-form"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { Input } from "@/components/ui/input"
import type { DHCPRangeDTO } from "@/api/exercises/versions"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { gatewayNameError, gatewaysOverLimit } from "@/lib/editor/schemas/infra"
import { renameGatewayInForm } from "@/lib/editor/gatewayRefs"
import { FieldLabel } from "@/components/ui/field-label"
import { MAX_DEVICE_NAME_LEN } from "@/lib/exerciseSchemas"
import { gatewayKindOf, isGatewayType } from "@/api/exercises/versions"
import { RemoveAction, REVEAL_ON_HOVER } from "../../RemoveAction"
import { AddButton, FieldError, SwitchBlock, SwitchList, fieldProps, useFieldError } from "../kit"
import { useLabSupport } from "../labCapabilities"
import { useMaxLabGateways } from "../gatewayLimit"
import { InputField, devicePath } from "./fields"

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

/**
 * The small settings dialog of a gateway device (H10): its name, DHCP with its ranges, the DNS of an Internet gateway, and
 * for a VPN gateway the switch «Дозволити зворотні зʼєднання». Same shell as the device editor, small. A new name applies
 * at once with every reference to the gateway; a name that does not pass stays a draft with its error beside the field.
 */
export function GatewayDialog({ variantIndex, deviceIndex, disabled, onClose }: {
  variantIndex: number
  deviceIndex: number
  disabled: boolean
  onClose: () => void
}) {
  const form = useFormContext<DraftFormValues>()
  const { control, setValue } = form
  const base = `Variants.${variantIndex}.Topology.Devices.${deviceIndex}` as const
  const path = devicePath(variantIndex, deviceIndex)
  const device = useWatch({ control, name: base })
  const devices = useWatch({ control, name: `Variants.${variantIndex}.Topology.Devices` }) ?? []
  const support = useLabSupport()
  const reverse = support("vpnReverse")
  const rangesError = useFieldError(`${path}.DHCPRanges`)
  const nameFormError = useFieldError(`${path}.Name`)
  const maxGateways = useMaxLabGateways()
  const [draft, setDraft] = useState<string | null>(null)
  if (!device || !isGatewayType(device.Type)) return null
  const kind = gatewayKindOf(device.Type)
  const draftError = draft === null ? "" : nameDraftError(draft, devices, device.ID)
  // A saved draft above a lowered platform limit: the surplus gateway says so beside its name.
  const limitError = maxGateways !== null && gatewaysOverLimit(devices, maxGateways).includes(deviceIndex) ? t("ed.c.val.gatewayLimit", { max: maxGateways }) : ""
  const nameError = draftError || nameFormError || limitError
  const nameProps = fieldProps(`${path}.Name`, nameError)

  function rename(next: string) {
    setDraft(next)
    if (nameDraftError(next, devices, device!.ID)) return
    renameGatewayInForm(form, variantIndex, device!.ID, next.trim())
    setDraft(null)
  }

  function setDhcp(on: boolean) {
    if (on && (device?.DHCPRanges ?? []).length === 0) setValue(`${base}.DHCPRanges`, [{ Start: 2, End: 254 }], { shouldDirty: true })
    setValue(`${base}.DHCP`, on, { shouldDirty: true, shouldValidate: true })
  }

  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="max-w-lg" data-gateway-dialog onOpenAutoFocus={(event) => { event.preventDefault(); document.querySelector<HTMLElement>("[data-gateway-dialog] input")?.focus() }}>
      <DialogHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 text-left">
          <DialogTitle className="truncate">{t("ed.c.gw.title", { name: device.Name })}</DialogTitle>
        </div>
        <HoverTooltip text={t("ed.ui.close")}><Button type="button" variant="ghost" size="icon" aria-label={t("ed.ui.close")} className="-mr-2 -mt-1 h-8 w-8 shrink-0" onClick={onClose}><X aria-hidden="true" className="h-4 w-4" /></Button></HoverTooltip>
      </DialogHeader>
      <DialogDescription className="text-[13px] leading-normal text-muted-foreground">{t(kind === "vpn" ? "ed.c.gw.vpnDescription" : "ed.c.gw.internetDescription")}</DialogDescription>
      <div className="min-w-0">
        <FieldLabel text={t("ed.c.gw.name")} required htmlFor={nameProps.id} help={{ intro: [t("ed.c.gw.nameHelp1"), t("ed.c.gw.nameHelp2")] }} className="mb-1" />
        <Input {...nameProps} value={draft ?? device.Name} disabled={disabled} maxLength={MAX_DEVICE_NAME_LEN} autoComplete="off" spellCheck={false} onChange={(event) => rename(event.target.value)} />
        <FieldError path={`${path}.Name`} message={nameError || undefined} />
      </div>
      <SwitchList>
        {kind === "vpn" && <SwitchBlock label={t("ed.c.gw.reverse")} checked={device.ReverseConnections ?? false} disabled={disabled}
          unavailable={!(device.ReverseConnections) && reverse.state === "disabled" ? reverse.reason : undefined}
          onCheckedChange={(on) => setValue(`${base}.ReverseConnections`, on, { shouldDirty: true, shouldValidate: true })}
          help={{ intro: t("ed.c.gw.reverseHelp"), items: [{ term: t("ed.c.gw.reverseOff"), text: t("ed.c.gw.reverseOffText") }, { term: t("ed.c.gw.reverseOn"), text: t("ed.c.gw.reverseOnText") }], default: [t("ed.c.access.off"), reverse.state === "warn" ? reverse.reason : ""].filter(Boolean).join(" ") }}>
          <FieldError path={`${path}.ReverseConnections`} />
        </SwitchBlock>}
        <SwitchBlock label={t("ed.c.gw.dhcp")} checked={device.DHCP ?? false} disabled={disabled} onCheckedChange={setDhcp}
          help={{ intro: t("ed.c.gw.dhcpHelp"), default: t("ed.c.gw.dhcpOff") }}>
          <div className="space-y-3">
            <Controller control={control} name={`${base}.DHCPRanges`} render={({ field }) => {
              const ranges = field.value ?? []
              const next = nextFreeRange(ranges)
              const props = fieldProps(`${path}.DHCPRanges`, rangesError)
              return <div className="space-y-2" id={props.id} tabIndex={-1}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{t("admin.exTopo.dhcp.ranges")}</span>
                  {!disabled && <AddButton label={t("admin.exTopo.dhcp.addRange")} onClick={() => next && field.onChange([...ranges, next])} blockedReason={next ? null : t("ed.c.gw.noFreeHosts")} />}
                </div>
                {ranges.map((range, index) => <div key={index} className="group flex items-center gap-2">
                  <span className="shrink-0 text-xs text-muted-foreground">.</span>
                  <Input type="number" min={2} max={254} step={1} value={range.Start} disabled={disabled} aria-label={t("admin.exTopo.dhcp.rangeStartN", { n: index + 1 })} aria-invalid={rangesError ? true : undefined}
                    aria-describedby={rangesError ? props["aria-describedby"] : undefined} className="min-w-0" onChange={(event) => field.onChange(ranges.map((item, i) => i === index ? { ...item, Start: Number(event.target.value) } : item))} />
                  <span aria-hidden="true" className="text-xs text-muted-foreground">—</span>
                  <span className="shrink-0 text-xs text-muted-foreground">.</span>
                  <Input type="number" min={2} max={254} step={1} value={range.End} disabled={disabled} aria-label={t("admin.exTopo.dhcp.rangeEndN", { n: index + 1 })} aria-invalid={rangesError ? true : undefined}
                    aria-describedby={rangesError ? props["aria-describedby"] : undefined} className="min-w-0" onChange={(event) => field.onChange(ranges.map((item, i) => i === index ? { ...item, End: Number(event.target.value) } : item))} />
                  {!disabled && <RemoveAction ariaLabel={t("admin.exTopo.dhcp.removeRangeN", { n: index + 1 })} onClick={() => field.onChange(ranges.filter((_, i) => i !== index))} className="h-9 w-9 shrink-0" wrapperClassName={REVEAL_ON_HOVER} />}
                </div>)}
                <FieldError path={`${path}.DHCPRanges`} />
              </div>
            }} />
            {kind === "internet" && <InputField name={`${path}.DNS`} label={t("ed.c.gw.dns")} mono disabled={disabled} placeholder="1.1.1.1" className="w-64 max-w-full"
              help={{ intro: t("ed.c.gw.dnsHelp"), default: t("ed.c.gw.dnsDefault") }} />}
          </div>
        </SwitchBlock>
      </SwitchList>
      <DialogFooter><Button type="button" onClick={onClose}>{t("ed.c.dev.done")}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}

/** The error of a typed gateway name: the device name rule, and unique among all devices of the variant. */
function nameDraftError(draft: string, devices: { ID: string; Name: string }[], id: string): string {
  const name = draft.trim()
  const rule = gatewayNameError(name)
  if (rule) return rule
  return devices.some((device) => device.ID !== id && device.Name === name) ? t("admin.ex.err.deviceNameDuplicate") : ""
}
