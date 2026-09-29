"use client"

import { Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form"
import { Plus } from "lucide-react"
import { t } from "@/i18n/t"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { SelectMenu } from "@/components/ui/select-menu"
import { emptyPlaceholder, type DraftFormValues } from "@/lib/exerciseSchemas"
import { RemoveAction } from "./RemoveAction"
import { FieldHelp } from "@/components/ui/field-help"
import { ExerciseFieldLabel } from "./ExerciseFieldLabel"

const KIND_OPTIONS = [
  { value: "vpn.subnet", labelKey: "admin.exPh.kind.vpnSubnet" },
  { value: "internet.subnet", labelKey: "admin.exPh.kind.internetSubnet" },
  { value: "ip", labelKey: "admin.exPh.kind.ip" },
  { value: "external.link", labelKey: "admin.exPh.kind.externalLink" },
]

const IPREF_OPTIONS = [
  { value: "vpn", labelKey: "admin.exPh.ipref.vpn" },
  { value: "internet", labelKey: "admin.exPh.ipref.internet" },
  { value: "static", labelKey: "admin.exPh.ipref.static" },
]

/**
 * PlaceholderList — structured description placeholders for a task.
 * Row fields depend on Kind; validated against the topology at publish time (backend).
 */
export function PlaceholderList({
  variantIndex,
  taskIndex,
  disabled,
}: {
  variantIndex: number
  taskIndex: number
  disabled: boolean
}) {
  const { control } = useFormContext<DraftFormValues>()
  const name = `Variants.${variantIndex}.Tasks.${taskIndex}.Placeholders` as const
  const { fields, append, remove } = useFieldArray({ control, name })
  const rows = useWatch({ control, name }) ?? []
  const vpn = useWatch({ control, name: `Variants.${variantIndex}.Topology.VPN.Enabled` })
  const internet = useWatch({ control, name: `Variants.${variantIndex}.Topology.Internet.Enabled` })
  const devices = useWatch({ control, name: `Variants.${variantIndex}.Topology.Devices` }) ?? []
  const externalDeviceNames = devices
    .filter((d) => d.External?.Enabled && d.Name)
    .map((d) => d.Name)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">{t("admin.exPh.title")}<FieldHelp text={t("admin.exPh.titleHelp")} /></span>
        {!disabled && (
          <Button type="button" variant="outline" size="sm" data-placeholder-add onClick={() => append(emptyPlaceholder())}>
            <Plus className="mr-1 h-4 w-4" />
            {t("admin.exPh.add")}
          </Button>
        )}
      </div>

      {fields.map((field, pi) => {
        const kind = rows[pi]?.Kind
        const ipRef = rows[pi]?.IPReference
        const kindOptions = KIND_OPTIONS.filter((option) =>
          option.value === kind || option.value === "ip" ||
          (option.value === "vpn.subnet" && vpn) ||
          (option.value === "internet.subnet" && internet) ||
          (option.value === "external.link" && externalDeviceNames.length > 0))
        const ipRefOptions = IPREF_OPTIONS.filter((option) =>
          option.value === ipRef || option.value === "static" ||
          (option.value === "vpn" && vpn) || (option.value === "internet" && internet))
        return (
          <div key={field.id} className="space-y-2 rounded-md border border-border p-3">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <ExerciseFieldLabel labelKey="admin.exPh.kind" helpKey="admin.exPh.kindHelp" required />
                <Controller
                  control={control}
                  name={`${name}.${pi}.Kind`}
                  render={({ field: kindField }) => (
                    <SelectMenu
                      value={kindField.value}
                      onChange={kindField.onChange}
                      disabled={disabled}
                      options={kindOptions.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
                      className="w-full"
                    />
                  )}
                />
              </div>
              {!disabled && (
                <RemoveAction ariaLabel={t("admin.exPh.remove")} onClick={() => remove(pi)} />
              )}
            </div>

            {kind === "ip" && (
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <ExerciseFieldLabel labelKey="admin.exPh.ipref" helpKey="admin.exPh.iprefHelp" required />
                  <Controller
                    control={control}
                    name={`${name}.${pi}.IPReference`}
                    render={({ field: refField }) => (
                      <SelectMenu
                        value={refField.value}
                        onChange={refField.onChange}
                        disabled={disabled}
                        options={ipRefOptions.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
                        className="w-full"
                      />
                    )}
                  />
                </div>
                <div>
                  <ExerciseFieldLabel labelKey="admin.exPh.lastOctet" helpKey="admin.exPh.lastOctetHelp" required />
                  <Controller
                    control={control}
                    name={`${name}.${pi}.LastOctet`}
                    render={({ field: octetField }) => (
                      <Input
                        type="number"
                        min={0}
                        max={255}
                        value={octetField.value}
                        disabled={disabled}
                        onChange={(e) => octetField.onChange(Number(e.target.value))}
                      />
                    )}
                  />
                </div>
                {ipRef === "static" && (
                  <div>
                    <ExerciseFieldLabel labelKey="admin.exPh.octets" helpKey="admin.exPh.octetsHelp" required />
                    <Controller
                      control={control}
                      name={`${name}.${pi}.Octets1to3`}
                      render={({ field: octetsField }) => (
                        <Input placeholder="10.0.0" value={octetsField.value} disabled={disabled}
                          onChange={octetsField.onChange} />
                      )}
                    />
                  </div>
                )}
                <div className="flex items-end gap-2 pb-1">
                  <Controller
                    control={control}
                    name={`${name}.${pi}.ShowMask`}
                    render={({ field: maskField }) => (
                      <Checkbox
                        id={`ph-mask-${variantIndex}-${taskIndex}-${pi}`}
                        ref={maskField.ref}
                        checked={maskField.value}
                        onChange={(e) => maskField.onChange(e.target.checked)}
                        onBlur={maskField.onBlur}
                        disabled={disabled}
                        label={t("admin.exPh.showMask")}
                      />
                    )}
                  />
                  <FieldHelp text={t("admin.exPh.showMaskHelp")} />
                </div>
              </div>
            )}

            {kind === "external.link" && (
              <div>
                <ExerciseFieldLabel labelKey="admin.exPh.device" helpKey="admin.exPh.deviceHelp" required />
                <Controller
                  control={control}
                  name={`${name}.${pi}.DeviceName`}
                  render={({ field: devField }) => (
                    <SelectMenu
                      value={devField.value}
                      onChange={devField.onChange}
                      disabled={disabled}
                      placeholder={t("admin.exPh.device.placeholder")}
                      options={[...(devField.value && !externalDeviceNames.includes(devField.value) ? [devField.value] : []), ...externalDeviceNames].map((n) => ({ value: n, label: n }))}
                      className="w-full"
                    />
                  )}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
