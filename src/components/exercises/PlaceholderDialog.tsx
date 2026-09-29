"use client"

import { useState } from "react"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { SelectMenu } from "@/components/ui/select-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { PlaceholderFormValues } from "@/lib/exerciseSchemas"
import { emptyPlaceholder } from "@/lib/exerciseSchemas"
import type { PlaceholderKind } from "@/api/exercises/versions"

export type PlaceholderTopology = {
  vpnEnabled: boolean
  internetEnabled: boolean
  externalDeviceNames: string[]
}

type PlaceholderDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: PlaceholderFormValues | null
  topology: PlaceholderTopology
  onSave: (value: PlaceholderFormValues) => void
}

export function PlaceholderDialog({ open, onOpenChange, value, topology, onSave }: PlaceholderDialogProps) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    {open && <PlaceholderDialogContent key={value?.Key ?? "new"} value={value} topology={topology} onSave={onSave} onOpenChange={onOpenChange} />}
  </Dialog>
}

function PlaceholderDialogContent({ value, topology, onSave, onOpenChange }: Omit<PlaceholderDialogProps, "open">) {
  const [draft, setDraft] = useState<PlaceholderFormValues | null>(value)
  const kind = draft?.Kind
  const canVPN = topology.vpnEnabled
  const canInternet = topology.internetEnabled
  const canIP = canVPN || canInternet
  const canExternal = topology.externalDeviceNames.length > 0
  const options: { kind: PlaceholderKind; enabled: boolean; reason: string; label: string }[] = [
    { kind: "vpn.subnet", enabled: canVPN, reason: t("admin.exPh.unavailable.vpn"), label: t("admin.exPh.kind.vpnSubnet") },
    { kind: "internet.subnet", enabled: canInternet, reason: t("admin.exPh.unavailable.internet"), label: t("admin.exPh.kind.internetSubnet") },
    { kind: "ip", enabled: canIP, reason: t("admin.exPh.unavailable.ip"), label: t("admin.exPh.kind.ip") },
    { kind: "external.link", enabled: canExternal, reason: t("admin.exPh.unavailable.external"), label: t("admin.exPh.kind.externalLink") },
  ]
  const selectedAvailable = options.find((option) => option.kind === kind)?.enabled ?? false
  const ipSourceAvailable = draft?.IPReference === "vpn" ? canVPN : draft?.IPReference === "internet" ? canInternet : draft?.IPReference === "static" && Boolean(value)
  const valid = Boolean(draft && (selectedAvailable || (Boolean(value) && draft.IPReference === "static")) &&
    (kind !== "ip" || (ipSourceAvailable && Number.isInteger(draft.LastOctet) && draft.LastOctet >= 0 && draft.LastOctet <= 255)) &&
    (kind !== "external.link" || topology.externalDeviceNames.includes(draft.DeviceName)))

  function choose(nextKind: PlaceholderKind) {
    const next = draft ?? emptyPlaceholder()
    setDraft({ ...next, Kind: nextKind,
      IPReference: nextKind === "ip" && !["vpn", "internet"].includes(next.IPReference)
        ? (canVPN ? "vpn" : "internet") : next.IPReference,
      DeviceName: nextKind === "external.link" && !topology.externalDeviceNames.includes(next.DeviceName)
        ? topology.externalDeviceNames[0] ?? "" : next.DeviceName,
    })
  }

  return <DialogContent className="max-h-[min(90dvh,42rem)] w-[min(34rem,calc(100vw-2rem))] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{value ? t("admin.exPh.edit") : t("admin.exPh.insert")}</DialogTitle>
        <DialogDescription>{t("admin.exPh.titleHelp")}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => <button key={option.kind} type="button" disabled={!option.enabled}
          aria-pressed={kind === option.kind} onClick={() => choose(option.kind)}
          className="min-h-16 rounded-md border border-border px-3 py-2 text-left text-sm transition-colors enabled:hover:bg-muted/50 enabled:focus-visible:outline-2 enabled:focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 aria-pressed:border-primary aria-pressed:bg-primary/5">
          <span className="block font-medium">{option.label}</span>
          {!option.enabled && <span className="mt-1 block text-xs leading-snug text-muted-foreground">{option.reason}</span>}
        </button>)}
      </div>
      {draft && (kind === "vpn.subnet" || kind === "internet.subnet" || kind === "ip") && <div className="space-y-3 border-t border-border pt-4">
        {kind === "ip" && <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className="mb-1 block text-sm font-medium">{t("admin.exPh.ipref")}</span>
            <SelectMenu ariaLabel={t("admin.exPh.ipref")} value={draft.IPReference}
              onChange={(IPReference) => setDraft({ ...draft, IPReference })}
              options={[
                ...(value?.IPReference === "static" ? [{ value: "static", label: t("admin.exPh.ipref.static") }] : []),
                ...(canVPN ? [{ value: "vpn", label: t("admin.exPh.ipref.vpn") }] : []),
                ...(canInternet ? [{ value: "internet", label: t("admin.exPh.ipref.internet") }] : []),
              ]} className="w-full" />
          </div>
          <div>
            <label htmlFor="placeholder-last-octet" className="mb-1 block text-sm font-medium">{t("admin.exPh.lastOctet")}</label>
            <Input id="placeholder-last-octet" type="number" min={0} max={255} value={draft.LastOctet}
              onChange={(event) => setDraft({ ...draft, LastOctet: Number(event.target.value) })} />
          </div>
          {draft.IPReference === "static" && value && <div>
            <label htmlFor="placeholder-static-octets" className="mb-1 block text-sm font-medium">{t("admin.exPh.octets")}</label>
            <Input id="placeholder-static-octets" value={draft.Octets1to3} onChange={(event) => setDraft({ ...draft, Octets1to3: event.target.value })} />
          </div>}
        </div>}
        <Checkbox checked={draft.ShowMask} onChange={(event) => setDraft({ ...draft, ShowMask: event.target.checked })}
          label={t("admin.exPh.showMask")} />
      </div>}
      {draft?.Kind === "external.link" && <div className="border-t border-border pt-4">
        <span className="mb-1 block text-sm font-medium">{t("admin.exPh.device")}</span>
        <SelectMenu ariaLabel={t("admin.exPh.device")} value={draft.DeviceName}
          onChange={(DeviceName) => setDraft({ ...draft, DeviceName })}
          options={[
            ...(draft.DeviceName && !topology.externalDeviceNames.includes(draft.DeviceName)
              ? [{ value: draft.DeviceName, label: `${draft.DeviceName} — ${t("admin.exPh.missing")}`, unavailable: true }] : []),
            ...topology.externalDeviceNames.map((device) => ({ value: device, label: device })),
          ]} className="w-full" />
      </div>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("admin.exPh.cancel")}</Button>
        <Button type="button" disabled={!valid} onClick={() => { if (draft && valid) onSave(draft) }}>
          {value ? t("admin.exPh.save") : t("admin.exPh.insertAction")}
        </Button>
      </DialogFooter>
    </DialogContent>
}
