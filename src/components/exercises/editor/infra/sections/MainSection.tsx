"use client"

import { useFormContext, useWatch } from "react-hook-form"
import { t } from "@/i18n/t"
import { FieldLabel } from "@/components/ui/field-label"
import { LoadingArea } from "@/components/ui/spinner"
import type { SelectMenuOption } from "@/components/ui/select-menu"
import { MAX_DEVICE_NAME_LEN, type DraftFormValues } from "@/lib/exerciseSchemas"
import { selectedPreset } from "@/lib/deviceResources"
import { TOPOLOGY_ICONS, topologyIconFor, type TopologyIconKey } from "@/lib/topologyIcons"
import { SelectMenu } from "@/components/ui/select-menu"
import { TopologyGlyph } from "../../../TopologyGlyph"
import { fieldProps } from "../../fieldErrors"
import { DeviceImageField } from "../../../ImageUpload"
import { ResourceSelect } from "../../../ResourceSelect"
import { useResourcesConfig, useResourcesConfigLoading } from "../../../ResourcesConfigContext"
import { useLabSupport } from "../../labCapabilities"
import { FieldGrid, InputField, SelectField, devicePath } from "../fields"
import type { DeviceProfile } from "@/api/exercises/model"

export type SectionProps = {
  variantIndex: number
  deviceIndex: number
  /** The whole dialog is read-only (viewing, or a linked variant). */
  disabled: boolean
}

const PROFILES: DeviceProfile[] = ["container", "microvm", "vm"]

/** «Основне»: name, profile of launch, image, resource size and security profile. */
export function MainSection({ variantIndex, deviceIndex, disabled, linkedBaseIndex, imageDisabled }: SectionProps & {
  /** A linked variant: its base's position. */
  linkedBaseIndex?: number
  imageDisabled?: boolean
}) {
  const { control, setValue, getValues } = useFormContext<DraftFormValues>()
  const dp = devicePath(variantIndex, deviceIndex)
  const support = useLabSupport()
  const config = useResourcesConfig()
  const loading = useResourcesConfigLoading()
  const deviceId = useWatch({ control, name: `Variants.${variantIndex}.Topology.Devices.${deviceIndex}.ID` })
  const visual = useWatch({ control, name: `Variants.${variantIndex}.Topology.VisualRender` })
  const icon = topologyIconFor({ ID: deviceId, Type: "node" }, visual ?? null)
  /** The pictogram of the device on the schema is the editor's own (VisualRender.icons), not a field of the device. */
  function setIcon(next: string) {
    const current = getValues(`Variants.${variantIndex}.Topology.VisualRender`) ?? {}
    const icons = current.icons && typeof current.icons === "object" && !Array.isArray(current.icons) ? current.icons as Record<string, unknown> : {}
    setValue(`Variants.${variantIndex}.Topology.VisualRender`, { ...current, version: 1, icons: { ...icons, [deviceId]: next } }, { shouldDirty: true })
  }
  const iconOptions = (Object.keys(TOPOLOGY_ICONS) as TopologyIconKey[]).map((key) => ({
    value: key, label: t(`admin.exTopo.icon.${key}`),
    content: <span className="flex items-center gap-2"><TopologyGlyph kind={key} className="h-5 w-5 shrink-0" /><span className="whitespace-nowrap">{t(`admin.exTopo.icon.${key}`)}</span></span>,
    triggerContent: <span className="flex items-center gap-2"><TopologyGlyph kind={key} className="h-5 w-5 shrink-0" />{t(`admin.exTopo.icon.${key}`)}</span>,
  }))
  const profile = useWatch({ control, name: `Variants.${variantIndex}.Topology.Devices.${deviceIndex}.Profile` })
  const preset = useWatch({ control, name: `Variants.${variantIndex}.Topology.Devices.${deviceIndex}.ResourcePreset` })

  const profileOptions: SelectMenuOption[] = PROFILES.map((value) => {
    const lab = support({ profile: value })
    // The virtual machine is announced, not offered yet (unless a draft already holds it).
    const soon = value === "vm" && profile !== "vm"
    const reason = soon ? t("ed.c.profile.soon") : lab.state === "disabled" ? lab.reason : ""
    const description = reason || (lab.state === "warn" ? `${t(`ed.c.profile.${value}Help`)} ${lab.reason}` : t(`ed.c.profile.${value}Help`))
    return { value, label: t(`ed.c.profile.${value}`), description, disabled: Boolean(reason) && value !== profile }
  })
  const securityOptions: SelectMenuOption[] = (["standard", "extended"] as const).map((value) => ({
    value, label: t(`admin.exTopo.security.${value}`), description: t(`admin.exTopo.security.${value}Help`),
  }))

  return <FieldGrid>
    <InputField name={`${dp}.Name`} label={t("ed.c.main.name")} required disabled={disabled} maxLength={MAX_DEVICE_NAME_LEN}
      help={{ intro: [t("ed.c.h.name1"), t("ed.c.h.name2")] }} />
    <SelectField name={`${dp}.Profile`} label={t("ed.c.main.profile")} disabled={disabled} options={profileOptions} menuClassName="w-[26rem] max-w-[90vw]"
      help={{ intro: t("ed.c.h.profile"), items: PROFILES.map((value) => ({ term: t(`ed.c.profile.${value}`), text: t(`ed.c.h.profile${value === "microvm" ? "Microvm" : value === "vm" ? "Vm" : "Container"}`) })) }} />
    <div className="min-w-0 @md:col-span-2">
      <DeviceImageField variantIndex={variantIndex} deviceIndex={deviceIndex} disabled={imageDisabled ?? disabled} compact baseVariantIndex={linkedBaseIndex} />
    </div>
    <div data-device-resources className="min-w-0 @md:col-span-2">
      <FieldLabel as="span" className="mb-1" text={t("ed.c.main.resources")} help={{ intro: [t("ed.c.h.resources1"), t("ed.c.h.resources2")] }} />
      {config
        ? <ResourceSelect config={config} disabled={disabled} ariaLabel={t("ed.c.main.resources")} value={selectedPreset({ ResourcePreset: preset }, config)}
          onChange={(next) => setValue(`Variants.${variantIndex}.Topology.Devices.${deviceIndex}.ResourcePreset`, next, { shouldDirty: true })} />
        : loading ? <LoadingArea compact className="h-10" label={t("admin.loading")} />
          // No settings (an older server, a failed load): the stored size as text.
          : <p data-read-field className="flex h-9 items-center rounded-md border border-border bg-card px-3 text-sm text-muted-foreground">{preset ? t("admin.exTopo.resourcesPreset", { preset }) : t("admin.exTopo.resourcesDefault")}</p>}
    </div>
    <SelectField name={`${dp}.SecurityPreset`} label={t("ed.c.main.security")} emptyAs="standard" disabled={disabled} options={securityOptions} menuClassName="w-[26rem] max-w-[90vw]"
      help={{ intro: t("ed.c.h.security"), items: [{ term: t("admin.exTopo.security.standard"), text: t("ed.c.h.securityStandard") }, { term: t("admin.exTopo.security.extended"), text: t("ed.c.h.securityExtended") }] }} />
    <div className="min-w-0">
      <FieldLabel as="span" className="mb-1" text={t("ed.c.main.icon")} help={{ intro: t("ed.c.main.iconHelp"), default: t("ed.c.main.iconDefault") }} />
      <SelectMenu {...fieldProps(`${dp}.Icon`, undefined)} ariaLabel={t("ed.c.main.icon")} value={icon} disabled={disabled} options={iconOptions} onChange={setIcon} className="w-full" menuClassName="max-h-72 overflow-y-auto" />
    </div>
  </FieldGrid>
}
