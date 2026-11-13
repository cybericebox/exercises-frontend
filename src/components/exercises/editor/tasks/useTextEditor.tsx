"use client"

import { useRef, useState, type ReactNode } from "react"
import type { TextFormatType } from "lexical"
import { useFormContext, useWatch } from "react-hook-form"
import { t } from "@/i18n/t"
import { exampleLabLink } from "@/lib/labId"
import { ipExample } from "@/lib/placeholderLink"
import { isValidIPv4, type DraftFormValues, type PlaceholderFormValues } from "@/lib/exerciseSchemas"
import type { VariableDef } from "@/components/editor/variableUtils"
import type { DescriptionEditorConfig } from "../../HintsEditor"
import { gatewayKindOf, isGatewayType, type GatewayDeviceType } from "@/api/exercises/versions"
import { PlaceholderDialog, type ExternalDevice, type GatewayOption } from "../../PlaceholderDialog"

/**
 * The one configuration of the description editor and every hint editor of a task: the same toolbar, the placeholders the
 * lab can fill (subnets, an address, a link to a device) with their example values, and the constructor dialog that creates
 * or edits a placeholder. «Вставити підстановку» offers ONLY placeholders: the answer of a task and a variable of the schema
 * never belong in a text the participant reads (the daemon refuses them, error 23519).
 */
export function useTextEditor(variantIndex: number, taskIndex: number): { config: DescriptionEditorConfig; dialog: ReactNode } {
  const { control, setValue } = useFormContext<DraftFormValues>()
  const base = `Variants.${variantIndex}.Tasks.${taskIndex}` as const
  const devices = useWatch({ control, name: `Variants.${variantIndex}.Topology.Devices` }) ?? []
  const placeholders = useWatch({ control, name: `${base}.Placeholders` }) ?? []
  const pendingInsert = useRef<((key: string, formats?: TextFormatType[]) => void) | null>(null)
  const pendingFormats = useRef<TextFormatType[]>([])
  const [open, setOpen] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const editing = placeholders.find((placeholder) => placeholder.Key === editingKey) ?? null

  const nodes = devices.filter((device) => device.Type === "node" && device.Name)
  const gateways: GatewayOption[] = devices.filter((device) => isGatewayType(device.Type) && device.Name).map((device) => ({ name: device.Name, kind: gatewayKindOf(device.Type as GatewayDeviceType) }))
  const hasGateway = (name: string) => gateways.some((gateway) => gateway.name === name)
  const accessOf = (placeholder: PlaceholderFormValues) => placeholder.Access ?? "http"
  const variables: VariableDef[] = placeholders.filter((placeholder) => {
    if (placeholder.Kind === "gateway.subnet") return hasGateway(placeholder.Gateway)
    if (placeholder.Kind === "ip") return (placeholder.IPReference === "static" && isValidIPv4(`${placeholder.Octets1to3}.${placeholder.LastOctet}`)) ||
      (placeholder.IPReference === "gateway" && hasGateway(placeholder.Gateway))
    if (placeholder.Kind === "external.link") return nodes.some((device) => device.Name === placeholder.DeviceName && device.Access.some((entry) => entry.Kind === accessOf(placeholder)))
    return false
  }).map((placeholder) => {
    const description = placeholder.Kind === "gateway.subnet" ? t("admin.exPh.kind.gatewaySubnetNamed", { gateway: placeholder.Gateway }) :
      t(placeholder.Kind === "external.link" ? "admin.exPh.kind.externalLink" : "admin.exPh.kind.ip")
    const example = placeholder.Kind === "external.link" ? exampleLabLink(placeholder.DeviceName || "web") :
      placeholder.Kind === "gateway.subnet" ? "10.0.0.0/24" :
      ipExample(placeholder)
    return { name: placeholder.Key, description, example }
  })
  const unavailableLabels = Object.fromEntries(placeholders.flatMap((placeholder) => {
    if (placeholder.Kind === "external.link" && placeholder.DeviceName) {
      const device = devices.find((candidate) => candidate.Name === placeholder.DeviceName)
      return device ? [[placeholder.Key, t("admin.exPh.deviceMissing", { name: device.Name })]] : []
    }
    return []
  }))
  const externalDevices: ExternalDevice[] = nodes.filter((device) => device.Access.length > 0).map((device) => ({ name: device.Name, access: device.Access.map((entry) => entry.Kind) }))

  const config: DescriptionEditorConfig = {
    maxContentHeight: 320, variables, unavailableLabels,
    onInsertVariable: (insert, formats) => { pendingInsert.current = insert; pendingFormats.current = formats; setEditingKey(null); setOpen(true) },
    onEditVariable: (key) => { pendingInsert.current = null; setEditingKey(key); setOpen(true) },
  }
  const dialog = <PlaceholderDialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) pendingInsert.current = null }}
    value={editing}
    topology={{ gateways, externalDevices }}
    onSave={(next: PlaceholderFormValues) => {
      const key = editingKey ?? next.Key
      const index = placeholders.findIndex((placeholder) => placeholder.Key === key)
      const updated = [...placeholders]
      if (index >= 0) updated[index] = { ...next, Key: key }
      else updated.push({ ...next, Key: key })
      setValue(`${base}.Placeholders`, updated, { shouldDirty: true, shouldValidate: true })
      pendingInsert.current?.(key, pendingFormats.current)
      pendingInsert.current = null
      setOpen(false)
    }} />
  return { config, dialog }
}
