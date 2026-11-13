"use client"

import { useState } from "react"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { SelectMenu } from "@/components/ui/select-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { PlaceholderFormValues } from "@/lib/exerciseSchemas"
import { emptyPlaceholder, placeholderToDTO } from "@/lib/exerciseSchemas"
import { FieldHelp } from "@/components/ui/field-help"
import { FieldLabel } from "@/components/ui/field-label"
import { LINK_SCHEMES, MAX_LINK_PATH, ipExample, isValidLinkPath, isValidLinkPort } from "@/lib/placeholderLink"
import type { GatewayKind, PlaceholderAccess, PlaceholderKind } from "@/api/exercises/versions"
import { ACCESS_KINDS, ACCESS_KINDS_SERVED, type AccessKind } from "@/api/exercises/model"

/** A device that can be linked to: its name and the access kinds it has switched on. */
export type ExternalDevice = { name: string; access: AccessKind[] }

/** A gateway of the lab a placeholder can name: its name and its kind. */
export type GatewayOption = { name: string; kind: GatewayKind }

export type PlaceholderTopology = {
  gateways: GatewayOption[]
  externalDevices: ExternalDevice[]
}

/** The access kind a new link to a device starts with: the web page when it has one, else the first served kind. */
function defaultAccess(device: ExternalDevice | undefined): PlaceholderAccess {
  if (!device) return "http"
  return device.access.includes("http") ? "http" : (device.access.find((kind) => ACCESS_KINDS_SERVED.includes(kind)) ?? device.access[0] ?? "http")
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
  const dirty = Boolean(draft && (!value || JSON.stringify(placeholderToDTO(draft)) !== JSON.stringify(placeholderToDTO(value))))
  const kind = draft?.Kind
  const gatewayNames = topology.gateways.map((gateway) => gateway.name)
  const canGateway = gatewayNames.length > 0
  const externalNames = topology.externalDevices.map((device) => device.name)
  const canExternal = externalNames.length > 0
  const externalDevice = topology.externalDevices.find((device) => device.name === draft?.DeviceName)
  const accessKind: AccessKind = draft?.Access ?? "http"
  const accessOk = Boolean(externalDevice?.access.includes(accessKind) && ACCESS_KINDS_SERVED.includes(accessKind))
  const options: { kind: PlaceholderKind; enabled: boolean; reason: string; label: string }[] = [
    { kind: "gateway.subnet", enabled: canGateway, reason: t("admin.exPh.unavailable.gateway"), label: t("admin.exPh.kind.gatewaySubnet") },
    { kind: "ip", enabled: canGateway, reason: t("admin.exPh.unavailable.ip"), label: t("admin.exPh.kind.ip") },
    { kind: "external.link", enabled: canExternal, reason: t("admin.exPh.unavailable.external"), label: t("admin.exPh.kind.externalLink") },
  ]
  const selectedAvailable = options.find((option) => option.kind === kind)?.enabled ?? false
  const gatewayChosen = Boolean(draft && gatewayNames.includes(draft.Gateway))
  const ipSourceAvailable = draft?.IPReference === "gateway" ? gatewayChosen : draft?.IPReference === "static" && Boolean(value)
  // The gateway dropdown belongs to a gateway subnet and to an address taken from a gateway.
  const needsGateway = kind === "gateway.subnet" || (kind === "ip" && draft?.IPReference === "gateway")
  // A source of an address: a gateway, and (only for an existing placeholder) the static octets. One source is no choice: no dropdown.
  const ipSources = [
    ...(value?.IPReference === "static" ? [{ value: "static", label: t("admin.exPh.ipref.static") }] : []),
    ...(canGateway || draft?.IPReference === "gateway" ? [{ value: "gateway", label: t("admin.exPh.ipref.gateway") }] : []),
  ]
  // The dialog says why the gateway is not usable: none chosen, or the one named is gone from the variant.
  const gatewayError = needsGateway && !gatewayChosen
    ? (draft?.Gateway ? t("admin.exPh.gatewayMissing", { name: draft.Gateway }) : t("admin.exPh.gatewayRequired")) : ""
  const asLink = kind === "ip" && Boolean(draft?.AsLink)
  const portError = asLink && !isValidLinkPort(draft?.PortText ?? "") ? t("admin.ex.val.placeholderPort") : ""
  const pathError = asLink && !isValidLinkPath(draft?.Path ?? "") ? t("admin.ex.val.placeholderPath") : ""
  const valid = Boolean(draft && !portError && !pathError && (selectedAvailable || (Boolean(value) && draft.IPReference === "static")) &&
    (kind !== "gateway.subnet" || gatewayChosen) &&
    (kind !== "ip" || (ipSourceAvailable && Number.isInteger(draft.LastOctet) && draft.LastOctet >= 0 && draft.LastOctet <= 255)) &&
    (kind !== "external.link" || (externalNames.includes(draft.DeviceName) && accessOk)))

  function choose(nextKind: PlaceholderKind) {
    const next = draft ?? emptyPlaceholder()
    setDraft({ ...next, Kind: nextKind,
      IPReference: nextKind === "ip" && next.IPReference !== "gateway" ? "gateway" : next.IPReference,
      Gateway: (nextKind === "gateway.subnet" || nextKind === "ip") && !gatewayNames.includes(next.Gateway) ? gatewayNames[0] ?? "" : next.Gateway,
      DeviceName: nextKind === "external.link" && !externalNames.includes(next.DeviceName)
        ? externalNames[0] ?? "" : next.DeviceName,
      Access: nextKind === "external.link" ? defaultAccess(topology.externalDevices.find((device) => device.name === (externalNames.includes(next.DeviceName) ? next.DeviceName : externalNames[0]))) : next.Access,
    })
  }

  return <DialogContent className="max-h-[min(90dvh,42rem)] w-[min(34rem,calc(100vw-2rem))] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{value ? t("admin.exPh.edit") : t("admin.exPh.insert")}</DialogTitle>
        <DialogDescription>{t("admin.exPh.titleHelp")}</DialogDescription>
      </DialogHeader>
      <div role="group" aria-labelledby="placeholder-kind-label" className="space-y-1.5">
      <FieldLabel as="span" id="placeholder-kind-label" text={t("admin.exPh.kind")} required helpText={t("admin.exPh.kindHelp")} />
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => <button key={option.kind} type="button" disabled={!option.enabled}
          aria-pressed={kind === option.kind} onClick={() => choose(option.kind)}
          className="min-h-16 rounded-md border border-border px-3 py-2 text-left text-sm transition-colors enabled:hover:bg-muted/50 enabled:focus-visible:outline-2 enabled:focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 aria-pressed:border-primary aria-pressed:bg-primary/5">
          <span className="block font-medium">{option.label}</span>
          {!option.enabled && <span className="mt-1 block text-xs leading-snug text-muted-foreground">{option.reason}</span>}
        </button>)}
      </div>
      </div>
      {draft && (kind === "gateway.subnet" || kind === "ip") && <div className="space-y-3 border-t border-border pt-4">
        {needsGateway && <div>
          <FieldLabel as="span" id="placeholder-gateway-label" className="mb-1" text={t("admin.exPh.gateway")} required helpText={t("admin.exPh.gatewayHelp")} />
          <SelectMenu ariaLabel={t("admin.exPh.gateway")} value={draft.Gateway} aria-invalid={gatewayError ? true : undefined} aria-describedby={gatewayError ? "placeholder-gateway-error" : undefined}
            onChange={(Gateway) => setDraft({ ...draft, Gateway })}
            options={[
              ...(draft.Gateway && !gatewayNames.includes(draft.Gateway)
                ? [{ value: draft.Gateway, label: t("admin.exPh.itemMissing", { name: draft.Gateway }), unavailable: true }] : []),
              ...topology.gateways.map((gateway) => ({ value: gateway.name, label: gateway.name, description: t(`admin.exPh.gatewayKind.${gateway.kind}`) })),
            ]} className="w-full" />
          {gatewayError && <p id="placeholder-gateway-error" role="alert" className="mt-1 text-xs text-destructive">{gatewayError}</p>}
        </div>}
        {kind === "ip" && <div className="grid gap-3 sm:grid-cols-2">
          {ipSources.length > 1 && <div>
            <FieldLabel as="span" id="placeholder-ipref-label" className="mb-1" text={t("admin.exPh.ipref")} required helpText={t("admin.exPh.iprefHelp")} />
            <SelectMenu ariaLabel={t("admin.exPh.ipref")} value={draft.IPReference}
              onChange={(IPReference) => setDraft({ ...draft, IPReference })}
              options={ipSources} className="w-full" />
          </div>}
          <div>
            <FieldLabel htmlFor="placeholder-last-octet" className="mb-1" text={t("admin.exPh.lastOctet")} required helpText={t("admin.exPh.lastOctetHelp")} />
            <Input id="placeholder-last-octet" type="number" min={0} max={255} value={draft.LastOctet}
              onChange={(event) => setDraft({ ...draft, LastOctet: Number(event.target.value) })} />
          </div>
          {draft.IPReference === "static" && value && <div>
            <FieldLabel htmlFor="placeholder-static-octets" className="mb-1" text={t("admin.exPh.octets")} required helpText={t("admin.exPh.octetsHelp")} />
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
            <FieldLabel as="span" className="mb-1" text={t("admin.exPh.scheme")} helpText={t("admin.exPh.schemeHelp")} />
            <SelectMenu ariaLabel={t("admin.exPh.scheme")} value={draft.Scheme || "http"}
              onChange={(Scheme) => setDraft({ ...draft, Scheme })}
              options={LINK_SCHEMES.map((scheme) => ({ value: scheme, label: scheme }))} className="w-full" />
          </div>
          <div>
            <FieldLabel htmlFor="placeholder-port" className="mb-1" text={t("admin.exPh.port")} helpText={t("admin.exPh.portHelp")} />
            <Input id="placeholder-port" inputMode="numeric" maxLength={5} value={draft.PortText ?? ""} placeholder={t("admin.exPh.port.placeholder")}
              aria-invalid={Boolean(portError)} aria-describedby={portError ? "placeholder-port-error" : undefined}
              onChange={(event) => setDraft({ ...draft, PortText: event.target.value.trim() })} />
            {portError && <p id="placeholder-port-error" className="mt-1 text-xs text-destructive">{portError}</p>}
          </div>
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="placeholder-path" className="mb-1" text={t("admin.exPh.path")} helpText={t("admin.exPh.pathHelp")} />
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
      {draft?.Kind === "external.link" && <div className="space-y-3 border-t border-border pt-4">
        <div>
          <FieldLabel as="span" id="placeholder-device-label" className="mb-1" text={t("admin.exPh.device")} required helpText={t("admin.exPh.deviceHelp")} />
          <SelectMenu ariaLabel={t("admin.exPh.device")} value={draft.DeviceName}
            onChange={(DeviceName) => setDraft({ ...draft, DeviceName, Access: defaultAccess(topology.externalDevices.find((device) => device.name === DeviceName)) })}
            options={[
              ...(draft.DeviceName && !externalNames.includes(draft.DeviceName)
                ? [{ value: draft.DeviceName, label: t("admin.exPh.itemMissing", { name: draft.DeviceName }), unavailable: true }] : []),
              ...externalNames.map((device) => ({ value: device, label: device })),
            ]} className="w-full" />
        </div>
        <div>
          <FieldLabel as="span" id="placeholder-access-label" className="mb-1" text={t("ed.b.ph.access")} required helpText={t("ed.b.ph.accessHelp")} />
          <SelectMenu ariaLabel={t("ed.b.ph.access")} value={accessKind} className="w-full"
            onChange={(Access) => setDraft({ ...draft, Access: Access as PlaceholderAccess })}
            options={ACCESS_KINDS.filter((kind) => externalDevice?.access.includes(kind) || (value !== null && kind === value.Access)).map((kind) => ({
              value: kind, label: t(`ed.b.ph.access.${kind}`),
              disabled: !ACCESS_KINDS_SERVED.includes(kind),
              description: !ACCESS_KINDS_SERVED.includes(kind) ? t("ed.b.ph.accessSoon") : !externalDevice?.access.includes(kind) ? t("ed.b.ph.accessOff") : undefined,
            }))} />
        </div>
      </div>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("admin.exPh.cancel")}</Button>
        <div className="min-h-10 sm:min-w-24">
          <Button type="button" className="w-full" disabled={!valid || Boolean(value && !dirty)} onClick={() => { if (draft && valid && dirty) onSave(draft) }}>
            {value ? t("admin.exPh.save") : t("admin.exPh.insertAction")}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
}
