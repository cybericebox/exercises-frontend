"use client"

import { useState } from "react"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { SelectMenu } from "@/components/ui/select-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { PlaceholderFormValues } from "@/lib/exerciseSchemas"
import { emptyPlaceholder } from "@/lib/exerciseSchemas"
import { FieldHelp } from "@/components/ui/field-help"
import { LINK_SCHEMES, MAX_LINK_PATH, ipExample, isValidLinkPath, isValidLinkPort } from "@/lib/placeholderLink"
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
  const asLink = kind === "ip" && Boolean(draft?.AsLink)
  const portError = asLink && !isValidLinkPort(draft?.PortText ?? "") ? t("admin.ex.val.placeholderPort") : ""
  const pathError = asLink && !isValidLinkPath(draft?.Path ?? "") ? t("admin.ex.val.placeholderPath") : ""
  const valid = Boolean(draft && !portError && !pathError && (selectedAvailable || (Boolean(value) && draft.IPReference === "static")) &&
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
        {kind === "ip" && <div className="flex items-center gap-2">
          <Switch id="placeholder-as-link" checked={asLink}
            onCheckedChange={(AsLink) => setDraft({ ...draft, AsLink, ShowMask: AsLink ? false : draft.ShowMask, Scheme: draft.Scheme || "http" })} />
          <label htmlFor="placeholder-as-link" className="text-sm leading-snug cursor-pointer select-none">{t("admin.exPh.asLink")}</label>
          <FieldHelp text={t("admin.exPh.asLinkHelp")} />
        </div>}
        {asLink && <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className="mb-1 flex items-center gap-1.5 text-sm font-medium">{t("admin.exPh.scheme")}<FieldHelp text={t("admin.exPh.schemeHelp")} /></span>
            <SelectMenu ariaLabel={t("admin.exPh.scheme")} value={draft.Scheme || "http"}
              onChange={(Scheme) => setDraft({ ...draft, Scheme })}
              options={LINK_SCHEMES.map((scheme) => ({ value: scheme, label: scheme }))} className="w-full" />
          </div>
          <div>
            <label htmlFor="placeholder-port" className="mb-1 flex items-center gap-1.5 text-sm font-medium">{t("admin.exPh.port")}<FieldHelp text={t("admin.exPh.portHelp")} /></label>
            <Input id="placeholder-port" inputMode="numeric" maxLength={5} value={draft.PortText ?? ""} placeholder={t("admin.exPh.port.placeholder")}
              aria-invalid={Boolean(portError)} aria-describedby={portError ? "placeholder-port-error" : undefined}
              onChange={(event) => setDraft({ ...draft, PortText: event.target.value.trim() })} />
            {portError && <p id="placeholder-port-error" className="mt-1 text-xs text-destructive">{portError}</p>}
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="placeholder-path" className="mb-1 flex items-center gap-1.5 text-sm font-medium">{t("admin.exPh.path")}<FieldHelp text={t("admin.exPh.pathHelp")} /></label>
            <Input id="placeholder-path" maxLength={MAX_LINK_PATH + 1} value={draft.Path ?? ""} placeholder={t("admin.exPh.path.placeholder")}
              aria-invalid={Boolean(pathError)} aria-describedby={pathError ? "placeholder-path-error" : undefined}
              onChange={(event) => setDraft({ ...draft, Path: event.target.value })} />
            {pathError && <p id="placeholder-path-error" className="mt-1 text-xs text-destructive">{pathError}</p>}
          </div>
          <p className="sm:col-span-2 text-sm">
            <span className="mr-2 text-muted-foreground">{t("admin.exPh.preview")}</span>
            <a href={ipExample(draft)} target="_blank" rel="noopener noreferrer" data-placeholder-preview
              className="break-all font-mono text-primary underline underline-offset-2" onClick={(event) => event.preventDefault()}>{ipExample(draft)}</a>
          </p>
        </div>}
        {!asLink && <div className="flex items-center gap-2">
          <Switch id="placeholder-show-mask" checked={draft.ShowMask} onCheckedChange={(ShowMask) => setDraft({ ...draft, ShowMask })} />
          <label htmlFor="placeholder-show-mask" className="text-sm leading-snug cursor-pointer select-none">{t("admin.exPh.showMask")}</label>
        </div>}
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
