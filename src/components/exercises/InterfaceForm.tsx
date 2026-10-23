"use client"

import { useId } from "react"
import { Controller, useFieldArray, useFormContext, useFormState, useWatch } from "react-hook-form"
import type { Control, FieldPath } from "react-hook-form"
import { Plus } from "lucide-react"
import { t } from "@/i18n/t"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { SelectMenu } from "@/components/ui/select-menu"
import { FormField, FormItem, FormControl, FormMessage } from "@/components/ui/form"
import { emptyInterface, type DraftFormValues } from "@/lib/exerciseSchemas"
import { ExerciseFieldLabel } from "./ExerciseFieldLabel"
import { ConfirmRemoveAction as RemoveAction } from "./ConfirmRemoveAction"
import { FieldHelp } from "@/components/ui/field-help"
import { useEditorPosition } from "./EditorPosition"
import { addressReferenceOverlapsDHCP, StaticAddressReference } from "./StaticAddressReference"
import type { NetworkIPRefDTO, NetworkSubnetRefDTO } from "@/api/exercises/versions"

type IPDraft = DraftFormValues["Variants"][number]["Topology"]["Devices"][number]["Interfaces"][number]["IP"]
// Form-scoped UI drafts survive inspector/tab unmounts and are never sent to the server.
const networkModeDrafts = new WeakMap<Control<DraftFormValues>, WeakMap<object, Map<string, Map<string, IPDraft>>>>()

type NetworkState = { Enabled: boolean; DHCP: boolean; DHCPRanges?: { Start: number; End: number }[] }

const IP_TYPES = [
  { value: "static", labelKey: "admin.exTopo.ip.static" },
  { value: "dhcp", labelKey: "admin.exTopo.ip.dhcp" },
  { value: "dhcp-preset", labelKey: "admin.exTopo.ip.dhcpPreset" },
  { value: "none", labelKey: "admin.exTopo.ip.none" },
]

function StaticRouteCard({ routesName, index, disabled, compact, vpn, internet, onRemove }: {
  routesName: `Variants.${number}.Topology.Devices.${number}.Interfaces.${number}.IP.Routes`
  index: number
  disabled: boolean
  compact: boolean
  vpn: NetworkState
  internet: NetworkState
  onRemove: () => void
}) {
  const { control, getFieldState, setValue } = useFormContext<DraftFormValues>()
  // react-hook-form's path type stops before this deeply nested route object.
  const destinationName = `${routesName}.${index}.Dst` as FieldPath<DraftFormValues>
  const destinationRefName = `${routesName}.${index}.DstRef` as FieldPath<DraftFormValues>
  const viaName = `${routesName}.${index}.Via` as FieldPath<DraftFormValues>
  const viaRefName = `${routesName}.${index}.ViaRef` as FieldPath<DraftFormValues>
  const formState = useFormState({ control, name: [destinationName, destinationRefName, viaName, viaRefName] })
  const destinationError = getFieldState(destinationName, formState).error?.message ?? getFieldState(destinationRefName, formState).error?.message
  const viaError = getFieldState(viaName, formState).error?.message ?? getFieldState(viaRefName, formState).error?.message

  const errorId = `${routesName}-${index}`

  return <div data-route-card className="space-y-1 rounded-md border border-border p-2">
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-medium text-muted-foreground">{t("admin.exTopo.routeItemN", { n: index + 1 })}</span>
      {!disabled && <RemoveAction ariaLabel={t("admin.exTopo.removeRoute")} onClick={onRemove} className="h-7 w-7" />}
    </div>
    <div data-route-fields className={`grid ${compact ? "grid-cols-1 gap-2" : "gap-2 sm:grid-cols-2"}`}>
      <FormField control={control} name={destinationName} render={({ field }) => <FormItem className="space-y-1">
        <ExerciseFieldLabel labelKey="admin.exTopo.routeDst" helpKey="admin.exTopo.routeDstHelp" required form />
        <Controller control={control} name={destinationRefName} render={({ field: refField }) => <StaticAddressReference
          invalid={Boolean(destinationError)} describedBy={destinationError ? `${errorId}-destination` : undefined}
          kind="destination" reference={(refField.value ?? null) as NetworkSubnetRefDTO | null} vpn={vpn} internet={internet} disabled={disabled}
          manualInput={<FormControl aria-invalid={Boolean(destinationError)} aria-describedby={destinationError ? `${errorId}-destination` : undefined}><Input name={field.name} onBlur={field.onBlur} ref={field.ref} value={typeof field.value === "string" ? field.value : ""} onChange={field.onChange} className={compact ? "h-9" : undefined} disabled={disabled} placeholder="10.1.0.0/16" /></FormControl>}
          onChange={(ref) => { refField.onChange(ref); setValue(destinationName, "", { shouldDirty: true }) }} />} />
        {typeof destinationError === "string" && <p id={`${errorId}-destination`} role="alert" data-error-slot className="text-xs font-medium leading-4 text-destructive">{t("admin.exTopo.routeDstError", { error: destinationError })}</p>}
      </FormItem>} />
      <FormField control={control} name={viaName} render={({ field }) => <FormItem className="space-y-1">
        <ExerciseFieldLabel labelKey="admin.exTopo.routeVia" helpKey="admin.exTopo.routeViaHelp" required form />
        <Controller control={control} name={viaRefName} render={({ field: refField }) => <StaticAddressReference
          invalid={Boolean(viaError)} describedBy={viaError ? `${errorId}-via` : undefined}
          kind="via" reference={(refField.value ?? null) as NetworkIPRefDTO | null} vpn={vpn} internet={internet} disabled={disabled}
          manualInput={<FormControl aria-invalid={Boolean(viaError)} aria-describedby={viaError ? `${errorId}-via` : undefined}><Input name={field.name} onBlur={field.onBlur} ref={field.ref} value={typeof field.value === "string" ? field.value : ""} onChange={field.onChange} className={compact ? "h-9" : undefined} disabled={disabled} placeholder="10.0.0.1" /></FormControl>}
          onChange={(ref) => { refField.onChange(ref); setValue(viaName, "", { shouldDirty: true }) }} />} />
        {typeof viaError === "string" && <p id={`${errorId}-via`} role="alert" data-error-slot className="text-xs font-medium leading-4 text-destructive">{t("admin.exTopo.routeViaError", { error: viaError })}</p>}
      </FormItem>} />
    </div>

  </div>
}

/** One static address and optional explicit routes for a single interface. */
function StaticIPFields({ name, disabled, compact, vpn, internet }: {
  name: `Variants.${number}.Topology.Devices.${number}.Interfaces.${number}`
  disabled: boolean
  compact: boolean
  vpn: NetworkState
  internet: NetworkState
}) {
  const { control, setValue, getFieldState } = useFormContext<DraftFormValues>()
  const routesName = `${name}.IP.Routes` as const
  const addressRefName = `${name}.IP.AddressRef` as const
  const gatewayRefName = `${name}.IP.GatewayRef` as const
  const addressRef = useWatch({ control, name: addressRefName }) ?? null
  const dhcpOverlap = addressRef && addressReferenceOverlapsDHCP(addressRef, addressRef.Network === "vpn" ? vpn : internet)
  const refState = useFormState({ control, name: [addressRefName, gatewayRefName, `${name}.IP.Addresses`, `${name}.IP.Gateway`] })
  const addressError = getFieldState(`${name}.IP.Addresses`, refState).error?.message
    ?? getFieldState(`${name}.IP.Addresses.0`, refState).error?.message
    ?? getFieldState(addressRefName, refState).error?.message
  const gatewayError = getFieldState(`${name}.IP.Gateway`, refState).error?.message
    ?? getFieldState(gatewayRefName, refState).error?.message
  const { fields, append, remove } = useFieldArray({ control, name: routesName })
  return (
    <div className={compact ? "space-y-2" : "space-y-4"}>
      <div data-static-ip-grid className={`grid grid-cols-1 ${compact ? "gap-2" : "gap-3"}`}>
        <FormField control={control} name={`${name}.IP.Addresses`} render={({ field }) => (
          <FormItem className={compact ? "space-y-1" : undefined}>
            <ExerciseFieldLabel labelKey="admin.exTopo.addresses" helpKey="admin.exTopo.addressesHelp" required form />
            <Controller control={control} name={addressRefName} render={({ field: refField }) => <StaticAddressReference
              invalid={Boolean(addressError)} describedBy={addressError ? `${name}-address-error` : undefined}
              kind="address" reference={refField.value ?? null} vpn={vpn} internet={internet} disabled={disabled}
              manualInput={<FormControl aria-invalid={Boolean(addressError)} aria-describedby={addressError ? `${name}-address-error` : undefined}><Input value={field.value[0] ?? ""} onChange={(event) => field.onChange([event.target.value])} disabled={disabled} placeholder="10.0.0.2/24" /></FormControl>}
              onChange={(ref) => { refField.onChange(ref); setValue(`${name}.IP.Addresses`, ref ? [] : [""], { shouldDirty: true }) }} />} />
            {dhcpOverlap && <p role="note" data-ip-warning className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-900 dark:text-amber-200">{t("admin.exTopo.ref.dhcpOverlap")}</p>}
            {addressError && <p id={`${name}-address-error`} role="alert" className="text-xs font-medium leading-5 text-destructive">{addressError}</p>}
          </FormItem>
        )} />
        <FormField control={control} name={`${name}.IP.Gateway`} render={({ field }) => (
          <FormItem className={compact ? "space-y-1" : undefined}>
            <ExerciseFieldLabel labelKey="admin.exTopo.gateway" helpKey="admin.exTopo.gatewayHelp" form />
            <Controller control={control} name={gatewayRefName} render={({ field: refField }) => <StaticAddressReference
              invalid={Boolean(gatewayError)} describedBy={gatewayError ? `${name}-gateway-error` : undefined}
              kind="gateway" reference={refField.value ?? null} vpn={vpn} internet={internet} disabled={disabled}
              manualInput={<FormControl aria-invalid={Boolean(gatewayError)} aria-describedby={gatewayError ? `${name}-gateway-error` : undefined}><Input {...field} disabled={disabled} placeholder="10.0.0.1" /></FormControl>}
              onChange={(ref) => { refField.onChange(ref); setValue(`${name}.IP.Gateway`, "", { shouldDirty: true }) }} />} />
            {gatewayError && <p id={`${name}-gateway-error`} role="alert" className="text-xs font-medium leading-5 text-destructive">{gatewayError}</p>}
          </FormItem>
        )} />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5"><span className="text-sm font-semibold">{t("admin.exTopo.routes")}</span><FieldHelp text={t("admin.exTopo.routesHelp")} /></div>
          {!disabled && <Button type="button" variant="outline" size="sm" onClick={() => append({ Dst: "", Via: "" })}><Plus className="mr-1 h-4 w-4" />{t("admin.exTopo.addRoute")}</Button>}
        </div>
        {fields.map((route, index) => <StaticRouteCard key={route.id} routesName={routesName} index={index} disabled={disabled} compact={compact} vpn={vpn} internet={internet} onRemove={() => remove(index)} />)}
      </div>
    </div>
  )
}

/** InterfaceForm — a container's interfaces: name, MAC, IP config. */
export function InterfaceForm({
  variantIndex,
  deviceIndex,
  disabled,
  compact = false,
}: {
  variantIndex: number
  deviceIndex: number
  disabled: boolean
  compact?: boolean
}) {
  const { control, setValue, getValues } = useFormContext<DraftFormValues>()
  const name = `Variants.${variantIndex}.Topology.Devices.${deviceIndex}.Interfaces` as const
  const { fields, append, remove } = useFieldArray({ control, name })
  const rows = useWatch({ control, name }) ?? []
  const vpn = useWatch({ control, name: `Variants.${variantIndex}.Topology.VPN` }) ?? { Enabled: false, DHCP: false }
  const internet = useWatch({ control, name: `Variants.${variantIndex}.Topology.Internet` }) ?? { Enabled: false, DHCP: false }
  const [selectedIndex, setSelectedIndex] = useEditorPosition("interface")
  const activeIndex = Math.min(selectedIndex, Math.max(fields.length - 1, 0))
  const uid = useId()
  const deviceId = useWatch({ control, name: `Variants.${variantIndex}.Topology.Devices.${deviceIndex}.ID` })
  const draftPrefix = `${deviceId}:`
  function modeDrafts() {
    const byVariant = networkModeDrafts.get(control) ?? new WeakMap<object, Map<string, Map<string, IPDraft>>>()
    networkModeDrafts.set(control, byVariant)
    const variant = getValues(`Variants.${variantIndex}`)
    const drafts = byVariant.get(variant) ?? new Map<string, Map<string, IPDraft>>()
    byVariant.set(variant, drafts)
    return drafts
  }
  function removeInterface(index: number) {
    const drafts = modeDrafts()
    if (drafts) {
      for (let position = index; position < rows.length; position++) {
        const next = drafts.get(`${draftPrefix}${position + 1}`)
        if (next) drafts.set(`${draftPrefix}${position}`, next)
        else drafts.delete(`${draftPrefix}${position}`)
      }
    }
    remove(index); setSelectedIndex(Math.max(0, index - 1))
  }

  function addInterface() {
    const used = new Set(rows.map((row) => row.Name.trim()))
    let next = 0
    while (used.has(`eth${next}`)) next++
    append({ ...emptyInterface(), Name: `eth${next}` })
    setSelectedIndex(fields.length)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5"><h4 className="text-sm font-semibold">{t("admin.exTopo.interfaces")}</h4><FieldHelp text={t("admin.exTopo.interfacesHelp")} /></div>
        {!disabled && (
          <Button type="button" variant="outline" size="sm" onClick={addInterface}>
            <Plus className="mr-1 h-4 w-4" />
            {t("admin.exTopo.addInterface")}
          </Button>
        )}
      </div>

      {fields.length > 1 && <div className="flex min-w-0 flex-nowrap gap-1 overflow-x-auto border-b border-border pb-2" role="tablist" aria-label={t("admin.exTopo.interfaces")}>
        {fields.map((field, ii) => <div key={field.id} className={`group inline-flex shrink-0 items-center rounded-md ${activeIndex === ii ? "bg-accent" : ""}`}><button type="button" role="tab" aria-selected={activeIndex === ii}
          id={`${uid}-tab-${ii}`} aria-controls={`${uid}-panel-${ii}`} tabIndex={activeIndex === ii ? 0 : -1}
          onKeyDown={(event) => {
            const next = event.key === "Home" ? 0 : event.key === "End" ? fields.length - 1
              : event.key === "ArrowRight" ? (ii + 1) % fields.length : event.key === "ArrowLeft" ? (ii - 1 + fields.length) % fields.length : null
            if (next === null) return
            event.preventDefault(); setSelectedIndex(next); document.getElementById(`${uid}-tab-${next}`)?.focus()
          }}
          onClick={() => setSelectedIndex(ii)}
          className={`rounded-md px-3 py-1.5 text-sm ${activeIndex === ii ? "font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}>
          {rows[ii]?.Name || t("admin.exTopo.interfaceItemN", { n: ii + 1 })}
        </button>{!disabled && <RemoveAction ariaLabel={t("admin.exTopo.removeInterface")} onClick={() => removeInterface(ii)} className="mr-1 h-7 w-7 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100" />}</div>)}
      </div>}

      {fields.map((field, ii) => {
        if (ii !== activeIndex) return null
        const ipType = rows[ii]?.IP?.Type
        return (
          <div key={field.id} data-interface-panel role={fields.length > 1 ? "tabpanel" : undefined} id={`${uid}-panel-${ii}`} aria-labelledby={fields.length > 1 ? `${uid}-tab-${ii}` : undefined} tabIndex={0} className={compact ? "space-y-2 pt-2" : "space-y-3 border-t border-border pt-3"}>
            {!compact && fields.length > 1 && <p className="text-xs font-medium text-muted-foreground">{t("admin.exTopo.interfaceItemN", { n: ii + 1 })}</p>}
            <div data-interface-grid className={`grid ${compact ? "grid-cols-1 gap-2 @min-[26rem]:grid-cols-2" : "gap-3 sm:grid-cols-2 lg:grid-cols-3"}`}>
              <FormField control={control} name={`${name}.${ii}.Name`} render={({ field: nameField, fieldState }) => (
                <FormItem className={compact ? "space-y-1" : undefined}>
                  <ExerciseFieldLabel labelKey="admin.exTopo.ifaceName" required form />
                  <FormControl><Input {...nameField} required disabled={disabled} placeholder={t("admin.exTopo.ifaceNamePlaceholder")} /></FormControl>
                  {fieldState.error && <FormMessage className="leading-5" />}
                </FormItem>
              )} />
              <FormField control={control} name={`${name}.${ii}.MAC`} render={({ field: macField, fieldState }) => (
                <FormItem className={compact ? "space-y-1" : undefined}>
                  <ExerciseFieldLabel labelKey="admin.exTopo.mac" helpKey="admin.exTopo.macHelp" form />
                  <FormControl>
                    <Input {...macField} disabled={disabled} placeholder={t("admin.exTopo.macPlaceholder")} />
                  </FormControl>
                  {fieldState.error && <FormMessage className="leading-5" />}
                </FormItem>
              )} />
              <div className={compact ? "space-y-1 @min-[26rem]:col-span-2" : "space-y-2"}>
                <ExerciseFieldLabel labelKey="admin.exTopo.ipType" helpKey="admin.exTopo.ipTypeHelp" required />
                <Controller
                  control={control}
                  name={`${name}.${ii}.IP.Type`}
                  render={({ field: typeField }) => (
                    <SelectMenu
                      value={typeField.value}
                      onChange={(value) => {
                        const current = getValues(`${name}.${ii}.IP`)
                        const byInterface = modeDrafts()
                        const drafts = byInterface.get(`${draftPrefix}${ii}`) ?? new Map<string, IPDraft>()
                        drafts.set(current.Type, structuredClone(current))
                        byInterface.set(`${draftPrefix}${ii}`, drafts)
                        const saved = drafts.get(value)
                        setValue(`${name}.${ii}.IP`, saved ? structuredClone(saved) : {
                          ...current, Type: value as typeof current.Type,
                          Addresses: value === "static" ? [""] : [], AddressRef: null,
                          Gateway: "", GatewayRef: null, Routes: [],
                        }, { shouldDirty: true })
                      }}
                      disabled={disabled}
                      ariaLabel={t("admin.exTopo.ipType")}
                      options={IP_TYPES.map((o) => ({ value: o.value, label: t(o.labelKey), description: t(`${o.labelKey}Help`) }))}
                      className="w-full"
                      menuClassName="w-[30rem] max-w-[90vw]"
                    />
                  )}
                />
              </div>
            </div>

            {ipType === "static" && <StaticIPFields name={`${name}.${ii}`} disabled={disabled} compact={compact} vpn={vpn} internet={internet} />}

          </div>
        )
      })}
    </div>
  )
}
