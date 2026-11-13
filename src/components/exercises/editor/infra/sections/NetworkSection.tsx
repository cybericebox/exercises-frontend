"use client"

import { useEffect, useRef, useState } from "react"
import { Controller, get, useFieldArray, useFormContext, useWatch, type Control } from "react-hook-form"
import { Plus, Trash2 } from "lucide-react"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { TableHeadHelp } from "../TableHeadHelp"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { FieldLabel } from "@/components/ui/field-label"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { Input } from "@/components/ui/input"
import type { SelectMenuOption } from "@/components/ui/select-menu"
import { isGatewayType, type NetworkIPRefDTO, type NetworkSubnetRefDTO } from "@/api/exercises/versions"
import { emptyInterface, interfaceNameError } from "@/lib/editor/schemas/infra"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { shortForwardingPort } from "@/lib/topologyPorts"
import { pluralKey } from "@/lib/presetLabels"
import { cn } from "@/utils/cn"
import { addressReferenceOverlapsDHCP, StaticAddressReference, type GatewaySource } from "../../../StaticAddressReference"
import { useResourcesConfig } from "../../../ResourcesConfigContext"
import { AddButton, ExpandableRow, FieldHelp } from "../../kit"
import { FieldError, fieldProps, useErrorsAt, useFieldError } from "../../fieldErrors"
import { InputField, SelectField } from "../fields"
import type { SectionProps } from "./MainSection"

type IPDraft = DraftFormValues["Variants"][number]["Topology"]["Devices"][number]["Interfaces"][number]["IP"]
// Form-scoped UI drafts survive the dialog's unmount and are never sent to the server.
const modeDrafts = new WeakMap<Control<DraftFormValues>, WeakMap<object, Map<string, Map<string, IPDraft>>>>()

const IP_TYPES = [
  { value: "static", label: "admin.exTopo.ip.static", help: "admin.exTopo.ip.staticHelp" },
  { value: "dhcp", label: "admin.exTopo.ip.dhcp", help: "admin.exTopo.ip.dhcpHelp" },
  { value: "dhcp-preset", label: "admin.exTopo.ip.dhcpPreset", help: "admin.exTopo.ip.dhcpPresetHelp" },
  { value: "none", label: "admin.exTopo.ip.none", help: "admin.exTopo.ip.noneHelp" },
] as const

const MODE_HELP = { static: "ed.c.h.modeStatic", dhcp: "ed.c.h.modeDhcpImage", "dhcp-preset": "ed.c.h.modeDhcpPlatform", none: "ed.c.h.modeNone" } as const

type Iface = DraftFormValues["Variants"][number]["Topology"]["Devices"][number]["Interfaces"][number]

function modeWords(ip: Iface["IP"]): string {
  if (ip.Type === "static") {
    if (ip.AddressRef) return t("ed.c.net.fromGateway", { gateway: ip.AddressRef.Gateway, host: ip.AddressRef.Host })
    return t("ed.c.net.staticAddress", { address: ip.Addresses[0] || "—" })
  }
  return t(IP_TYPES.find((type) => type.value === ip.Type)?.label ?? "admin.exTopo.ip.none")
}

function refWords(ref: NetworkIPRefDTO | null | undefined, text: string): string {
  return ref ? t("ed.c.net.fromGateway", { gateway: ref.Gateway, host: "Host" in ref ? ref.Host : 0 }) : text || "—"
}

const GRID = "grid min-w-0 text-sm grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] items-baseline gap-x-4 @lg:grid-cols-[minmax(6.75rem,0.8fr)_minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.6fr)]"

/** «Мережа»: interfaces as rows. A closed row is a plain text summary, an open row is the form; one is open at a time. */
export function NetworkSection({ variantIndex, deviceIndex, disabled }: SectionProps) {
  const { control, getValues } = useFormContext<DraftFormValues>()
  const base = `Variants.${variantIndex}.Topology.Devices.${deviceIndex}` as const
  const { fields, append, remove } = useFieldArray({ control, name: `${base}.Interfaces` })
  const rows = useWatch({ control, name: `${base}.Interfaces` }) ?? []
  const deviceId = useWatch({ control, name: `${base}.ID` })
  const connections = useWatch({ control, name: `Variants.${variantIndex}.Topology.Connections` }) ?? []
  const devices = useWatch({ control, name: `Variants.${variantIndex}.Topology.Devices` }) ?? []
  const gateways: GatewaySource[] = devices.filter((device) => isGatewayType(device.Type)).map((device) => ({ Name: device.Name, DHCP: device.DHCP, DHCPRanges: device.DHCPRanges }))
  const config = useResourcesConfig()
  const errorRows = (get(useErrorsAt(`${base}.Interfaces`), `${base}.Interfaces`) ?? []) as unknown[]
  const firstBad = Array.isArray(errorRows) ? errorRows.findIndex(Boolean) : -1
  const [open, setOpen] = useState(firstBad)
  const [pendingRemoval, setPendingRemoval] = useState<number | null>(null)
  // A new validation result that points at a closed row opens it, so the error is beside its field.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the row with an error opens when the error appears
    if (firstBad >= 0) setOpen(firstBad)
  }, [firstBad])
  const effectiveOpen = open >= 0 && open < fields.length ? open : -1
  const limit = config?.MaxInterfacesPerDevice
  const full = limit !== undefined && fields.length >= limit

  function endLabel(endpoint: { Kind: string; DeviceID: string; Interface: string }): string {
    const device = devices.find((candidate) => candidate.ID === endpoint.DeviceID)
    return `${device?.Name || t("admin.exTopo.unnamedDevice")} · ${endpoint.Interface ? shortForwardingPort(endpoint.Interface) : "—"}`
  }
  const linksOf = (name: string): string[] => connections
    .filter((connection) => connection.Endpoints.some((endpoint) => endpoint.Kind === "device" && endpoint.DeviceID === deviceId && endpoint.Interface === name))
    .map((connection) => endLabel(connection.Endpoints.find((endpoint) => !(endpoint.Kind === "device" && endpoint.DeviceID === deviceId && endpoint.Interface === name)) ?? connection.Endpoints[0]))

  function addInterface() {
    const used = new Set(rows.map((row) => row.Name.trim()))
    let next = 0
    while (used.has(`eth${next}`)) next++
    append({ ...emptyInterface(), Name: `eth${next}`, IP: { ...emptyInterface().IP, Type: "none" } })
    setOpen(fields.length)
  }

  function removeInterface(index: number) {
    const drafts = draftsOf(control, getValues(`Variants.${variantIndex}`))
    for (let position = index; position <= rows.length; position++) {
      const next = drafts.get(`${deviceId}:${position + 1}`)
      if (next) drafts.set(`${deviceId}:${position}`, next)
      else drafts.delete(`${deviceId}:${position}`)
    }
    remove(index)
    setOpen(-1)
    setPendingRemoval(null)
  }

  return <div className="space-y-3">
    {fields.length === 0
      ? <EmptyState compact message={t("ed.c.net.empty")} />
      : <div role="group" aria-label={t("ed.c.net.title")} className="min-w-0 rounded-lg border border-border bg-background">
        <div className="flex bg-background text-[13px] font-semibold text-muted-foreground @max-lg:hidden">
          <span className="w-8 shrink-0" />
          <div className={cn(GRID, "flex-1 py-2")}>
            <TableHeadHelp text={t("ed.c.net.colName")} help={{ intro: [t("ed.c.h.ifaceName1"), t("ed.c.h.ifaceName2")] }} />
            <TableHeadHelp text={t("ed.c.net.colMode")} help={{ intro: t("ed.c.h.ifMode"), items: IP_TYPES.map((type) => ({ term: t(type.label), text: t(MODE_HELP[type.value]) })) }} />
            <TableHeadHelp text={t("ed.c.net.colGateway")} help={{ intro: [t("ed.c.h.gateway1"), t("ed.c.h.gateway2")], default: t("ed.c.h.optional") }} />
            <TableHeadHelp text={t("ed.c.net.colRoutes")} help={{ intro: t("ed.c.h.routesCount") }} />
            <TableHeadHelp text={t("ed.c.net.colLinks")} help={{ intro: [t("ed.c.h.links1"), t("ed.c.h.links2")] }} />
          </div>
          <span className="w-10 shrink-0" />
        </div>
        <div className="border-t border-border">
          {fields.map((field, index) => {
            const iface = rows[index]
            if (!iface) return null
            const links = linksOf(iface.Name)
            const isOpen = effectiveOpen === index
            const ip = iface.IP
            const routes = ip.Routes?.length ?? 0
            const summary = <div className={GRID}>
              <span className="font-mono text-[13px]">{iface.Name}</span>
              <span>{modeWords(ip)}</span>
              <span className="@max-lg:hidden">{ip.Type === "static" ? refWords(ip.GatewayRef, ip.Gateway) : "—"}</span>
              <span className="@max-lg:hidden">{routes ? t(pluralKey("ed.c.net.routes", routes), { count: routes }) : "—"}</span>
              <span className="@max-lg:hidden text-muted-foreground">{links.length ? t("ed.c.net.linkedTo", { names: links.join(", ") }) : t("ed.c.net.notLinked")}</span>
            </div>
            return <ExpandableRow key={field.id} open={isOpen} onOpenChange={(next) => setOpen(next ? index : -1)} ariaLabel={iface.Name || t("ed.c.net.unnamed")} summary={isOpen ? <span className="sr-only">{iface.Name}</span> : summary}
              actions={!disabled && links.length === 0 ? [{ key: "remove", label: t("admin.exTopo.removeInterface"), icon: <Trash2 aria-hidden="true" className="h-4 w-4" />, danger: true, onSelect: () => setPendingRemoval(index) }] : []}>
              <InterfaceForm base={base} index={index} deviceId={deviceId} disabled={disabled} gateways={gateways} links={links}
                otherNames={rows.filter((_, other) => other !== index).map((row) => row.Name)} />
            </ExpandableRow>
          })}
        </div>
      </div>}
    {!disabled && <div className="flex items-center gap-1">
      <AddButton label={t("ed.c.net.add")} onClick={addInterface} blockedReason={full ? t("ed.c.net.limit", { max: limit ?? 0 }) : null} />
      <FieldHelp help={{ intro: [t("ed.c.net.addHelp1"), t("ed.c.net.addHelp2")] }} />
    </div>}
    <ConfirmDialog open={pendingRemoval !== null} onCancel={() => setPendingRemoval(null)} tone="danger" title={t("ed.c.net.removeTitle")}
      description={t("ed.c.net.removeDescription", { name: pendingRemoval !== null ? rows[pendingRemoval]?.Name ?? "" : "" })}
      confirmLabel={t("ed.c.net.remove")} onConfirm={() => { if (pendingRemoval !== null) removeInterface(pendingRemoval) }} />
  </div>
}

function draftsOf(control: Control<DraftFormValues>, variant: object) {
  const byVariant = modeDrafts.get(control) ?? new WeakMap<object, Map<string, Map<string, IPDraft>>>()
  modeDrafts.set(control, byVariant)
  const drafts = byVariant.get(variant) ?? new Map<string, Map<string, IPDraft>>()
  byVariant.set(variant, drafts)
  return drafts
}

function InterfaceForm({ base, index, deviceId, disabled, gateways, links, otherNames }: {
  base: `Variants.${number}.Topology.Devices.${number}`
  index: number
  deviceId: string
  disabled: boolean
  gateways: GatewaySource[]
  links: string[]
  otherNames: string[]
}) {
  const { control, setValue, getValues } = useFormContext<DraftFormValues>()
  const variantIndex = Number(base.split(".")[1])
  const path = `${base}.Interfaces.${index}` as const
  const ipType = useWatch({ control, name: `${path}.IP.Type` })
  const name = useWatch({ control, name: `${path}.Name` })
  const [draft, setDraft] = useState<string | null>(null)
  const formError = useFieldError(`${path}.Name`)
  const draftError = draft === null ? "" : interfaceNameError(draft, otherNames)
  const nameError = draftError || formError
  const nameProps = fieldProps(`${path}.Name`, nameError)

  /** A valid name is applied at once, with the connections that use it; an invalid one stays a draft with its error. */
  function rename(next: string) {
    setDraft(next)
    if (interfaceNameError(next, otherNames)) return
    const connectionsPath = `Variants.${variantIndex}.Topology.Connections` as const
    const updated = getValues(connectionsPath).map((connection) => ({
      ...connection,
      Endpoints: connection.Endpoints.map((endpoint) => endpoint.Kind === "device" && endpoint.DeviceID === deviceId && endpoint.Interface === name ? { ...endpoint, Interface: next } : endpoint),
    }))
    setValue(connectionsPath, updated, { shouldDirty: true })
    setValue(`${path}.Name`, next, { shouldDirty: true, shouldValidate: true })
    setDraft(null)
  }

  const previousType = useRef<string>(ipType)
  useEffect(() => { previousType.current = ipType }, [ipType])

  function changeType(value: string) {
    const current = getValues(`${path}.IP`)
    const drafts = draftsOf(control, getValues(`Variants.${variantIndex}`))
    const key = `${deviceId}:${index}`
    const byMode = drafts.get(key) ?? new Map<string, IPDraft>()
    // The field already took the new type; the previous mode's content is what was there before.
    byMode.set(previousType.current, structuredClone({ ...current, Type: previousType.current as IPDraft["Type"] }))
    drafts.set(key, byMode)
    const saved = byMode.get(value)
    setValue(`${path}.IP`, saved ? structuredClone(saved) : {
      ...current, Type: value as IPDraft["Type"], Addresses: value === "static" ? [""] : [], AddressRef: null, Gateway: "", GatewayRef: null, Routes: [],
    }, { shouldDirty: true, shouldValidate: true })
    previousType.current = value
  }
  const typeOptions: SelectMenuOption[] = IP_TYPES.map((type) => ({ value: type.value, label: t(type.label), description: t(type.help) }))
  return <div className="space-y-4 pr-3 pt-1" data-interface-form>
    <div className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-3 @md:grid-cols-2">
      <div className="min-w-0">
        <FieldLabel text={t("ed.c.net.ifaceName")} required htmlFor={nameProps.id} help={{ intro: [t("ed.c.h.ifaceName1"), t("ed.c.h.ifaceName2")] }} className="mb-1" />
        <Input {...nameProps} value={draft ?? name} disabled={disabled} placeholder={t("ed.c.ph.iface")} autoComplete="off" spellCheck={false} className="font-mono text-[13px]" onChange={(event) => rename(event.target.value)} />
        <FieldError path={`${path}.Name`} message={nameError || undefined} />
      </div>
      <SelectField name={`${path}.IP.Type`} label={t("ed.c.net.mode")} required options={typeOptions} disabled={disabled} menuClassName="w-[30rem] max-w-[90vw]" onValue={changeType}
        help={{ intro: t("ed.c.h.ifMode"), items: IP_TYPES.map((type) => ({ term: t(type.label), text: t(MODE_HELP[type.value]) })) }} />
    </div>
    {ipType === "static" && <StaticFields path={path} disabled={disabled} gateways={gateways} />}
    <InputField name={`${path}.MAC`} label={t("ed.c.net.mac")} mono disabled={disabled} placeholder={t("admin.exTopo.macPlaceholder")} className=""
      help={{ intro: t("ed.c.h.mac"), default: t("ed.c.h.macDefault") }} />
    <div className="min-w-0">
      <FieldLabel as="span" text={t("ed.c.net.links")} help={{ intro: [t("ed.c.h.links1"), t("ed.c.h.links2")] }} />
      <p className="text-sm">{links.length ? links.join(", ") : <span className="text-muted-foreground">{t("ed.c.net.noLinks")}</span>}</p>
    </div>
  </div>
}

function firstOf(...messages: (string | undefined)[]): string | undefined {
  return messages.find((message) => message)
}

/** One static address, a gateway and explicit routes; each source is the app's own choice (typed or from a lab network). */
function StaticFields({ path, disabled, gateways }: { path: `Variants.${number}.Topology.Devices.${number}.Interfaces.${number}`; disabled: boolean; gateways: GatewaySource[] }) {
  const { control, setValue } = useFormContext<DraftFormValues>()
  const addressRef = useWatch({ control, name: `${path}.IP.AddressRef` }) ?? null
  const overlap = addressRef && addressReferenceOverlapsDHCP(addressRef, gateways)
  const addressError = firstOf(useFieldError(`${path}.IP.Addresses`), useFieldError(`${path}.IP.Addresses.0`), useFieldError(`${path}.IP.AddressRef`))
  const gatewayError = firstOf(useFieldError(`${path}.IP.Gateway`), useFieldError(`${path}.IP.GatewayRef`))
  const addressPath = `${path}.IP.Addresses.0`
  const gatewayPath = `${path}.IP.Gateway`
  const { fields, append, remove } = useFieldArray({ control, name: `${path}.IP.Routes` })

  return <div className="space-y-4">
    <div className="grid min-w-0 grid-cols-1 gap-y-4">
      <div className="min-w-0">
        <FieldLabel text={t("admin.exTopo.addresses")} required htmlFor={fieldProps(addressPath, addressError).id} help={{ intro: [t("ed.c.h.address1"), t("ed.c.h.address2")] }} />
        <Controller control={control} name={`${path}.IP.AddressRef`} render={({ field: refField }) => <StaticAddressReference invalid={Boolean(addressError)} describedBy={addressError ? `${fieldProps(addressPath, addressError)["aria-describedby"]}` : undefined}
          kind="address" reference={refField.value ?? null} gateways={gateways} disabled={disabled}
          manualInput={<Controller control={control} name={`${path}.IP.Addresses`} render={({ field }) => <Input {...fieldProps(addressPath, addressError)} value={field.value[0] ?? ""} onChange={(event) => field.onChange([event.target.value])} disabled={disabled} placeholder="10.0.0.2/24" className="font-mono text-[13px]" autoComplete="off" />} />}
          onChange={(ref) => { refField.onChange(ref); setValue(`${path}.IP.Addresses`, ref ? [] : [""], { shouldDirty: true }) }} />} />
        {overlap && <p role="note" data-ip-warning className="mt-1 text-xs leading-5 text-[var(--ib-warn)]">{t("admin.exTopo.ref.dhcpOverlap")}</p>}
        <FieldError path={addressPath} message={addressError} />
      </div>
      <div className="min-w-0">
        <FieldLabel text={t("admin.exTopo.gateway")} htmlFor={fieldProps(gatewayPath, gatewayError).id} help={{ intro: [t("ed.c.h.gateway1"), t("ed.c.h.gateway2")], default: t("ed.c.h.optional") }} />
        <Controller control={control} name={`${path}.IP.GatewayRef`} render={({ field: refField }) => <StaticAddressReference invalid={Boolean(gatewayError)} describedBy={gatewayError ? `${fieldProps(gatewayPath, gatewayError)["aria-describedby"]}` : undefined}
          kind="gateway" reference={refField.value ?? null} gateways={gateways} disabled={disabled}
          manualInput={<Controller control={control} name={`${path}.IP.Gateway`} render={({ field }) => <Input {...fieldProps(gatewayPath, gatewayError)} value={field.value} onChange={field.onChange} disabled={disabled} placeholder="10.0.0.1" className="font-mono text-[13px]" autoComplete="off" />} />}
          onChange={(ref) => { refField.onChange(ref); setValue(`${path}.IP.Gateway`, "", { shouldDirty: true }) }} />} />
        <FieldError path={gatewayPath} message={gatewayError} />
      </div>
    </div>
    <div className="min-w-0 space-y-2">
      <FieldLabel as="span" text={t("admin.exTopo.routes")} help={{ intro: t("ed.c.h.routes"), default: t("ed.c.h.optional") }} className="min-h-0" labelClassName="font-semibold" />
      {fields.map((route, index) => <RouteRow key={route.id} path={path} index={index} disabled={disabled} gateways={gateways} onRemove={() => remove(index)} />)}
      {!disabled && <div><Button type="button" variant="outline" size="sm" onClick={() => append({ Dst: "", Via: "" })}><Plus aria-hidden="true" className="mr-1 h-4 w-4" />{t("admin.exTopo.addRoute")}</Button></div>}
    </div>
  </div>
}

function RouteRow({ path, index, disabled, gateways, onRemove }: { path: string; index: number; disabled: boolean; gateways: GatewaySource[]; onRemove: () => void }) {
  const { control, setValue } = useFormContext<DraftFormValues>()
  const routePath = `${path}.IP.Routes.${index}`
  const dstError = firstOf(useFieldError(`${routePath}.Dst`), useFieldError(`${routePath}.DstRef`))
  const viaError = firstOf(useFieldError(`${routePath}.Via`), useFieldError(`${routePath}.ViaRef`))
  const dstProps = fieldProps(`${routePath}.Dst`, dstError)
  const viaProps = fieldProps(`${routePath}.Via`, viaError)
  const name = (suffix: string) => `${routePath}.${suffix}` as never
  return <div data-route-card role="group" aria-label={t("admin.exTopo.routeItemN", { n: index + 1 })} className="group grid min-w-0 grid-cols-[minmax(0,1fr)_2rem] items-start gap-2 rounded-md border border-border p-2">
    <div className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-2 @md:grid-cols-2">
      <div className="min-w-0 space-y-1">
        <FieldLabel text={t("admin.exTopo.routeDst")} required htmlFor={dstProps.id} help={{ intro: t("admin.exTopo.routeDstHelp") }} />
        <Controller control={control} name={name("DstRef")} render={({ field: refField }) => <StaticAddressReference invalid={Boolean(dstError)} describedBy={dstError ? dstProps["aria-describedby"] : undefined}
          kind="destination" reference={(refField.value ?? null) as NetworkSubnetRefDTO | null} gateways={gateways} disabled={disabled}
          manualInput={<Controller control={control} name={name("Dst")} render={({ field }) => <Input {...dstProps} value={typeof field.value === "string" ? field.value : ""} onChange={field.onChange} disabled={disabled} placeholder="10.1.0.0/16" className="font-mono text-[13px]" autoComplete="off" />} />}
          onChange={(ref) => { refField.onChange(ref); setValue(name("Dst"), "" as never, { shouldDirty: true }) }} />} />
        <FieldError path={`${routePath}.Dst`} message={dstError ? t("admin.exTopo.routeDstError", { error: dstError }) : undefined} />
      </div>
      <div className="min-w-0 space-y-1">
        <FieldLabel text={t("admin.exTopo.routeVia")} required htmlFor={viaProps.id} help={{ intro: t("admin.exTopo.routeViaHelp") }} />
        <Controller control={control} name={name("ViaRef")} render={({ field: refField }) => <StaticAddressReference invalid={Boolean(viaError)} describedBy={viaError ? viaProps["aria-describedby"] : undefined}
          kind="via" reference={(refField.value ?? null) as NetworkIPRefDTO | null} gateways={gateways} disabled={disabled}
          manualInput={<Controller control={control} name={name("Via")} render={({ field }) => <Input {...viaProps} value={typeof field.value === "string" ? field.value : ""} onChange={field.onChange} disabled={disabled} placeholder="10.0.0.1" className="font-mono text-[13px]" autoComplete="off" />} />}
          onChange={(ref) => { refField.onChange(ref); setValue(name("Via"), "" as never, { shouldDirty: true }) }} />} />
        <FieldError path={`${routePath}.Via`} message={viaError ? t("admin.exTopo.routeViaError", { error: viaError }) : undefined} />
      </div>
    </div>
    {!disabled && <HoverTooltip text={t("admin.exTopo.removeRoute")}><Button type="button" variant="ghost" size="icon" aria-label={t("admin.exTopo.removeRoute")} onClick={onRemove}
      className="mt-6 h-9 w-8 text-destructive opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"><Trash2 aria-hidden="true" className="h-4 w-4" /></Button></HoverTooltip>}
  </div>
}
