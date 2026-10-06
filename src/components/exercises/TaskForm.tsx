"use client"

import { exampleLabLink } from "@/lib/labId"
import { ipExample } from "@/lib/placeholderLink"
import { useEffect, useRef, useState } from "react"
import { Controller, useFormContext, useWatch } from "react-hook-form"
import { t } from "@/i18n/t"
import { Input } from "@/components/ui/input"
import { SelectMenu } from "@/components/ui/select-menu"
import { FormField, FormItem, FormControl, FormMessage } from "@/components/ui/form"
import RichTextEditor from "@/components/editor/RichTextEditor"
import { AttachmentList, type AttachmentListHandle } from "./AttachmentList"
import { FlagInput } from "./FlagInput"
import { PlaceholderDialog } from "./PlaceholderDialog"
import { ExerciseFieldLabel } from "./ExerciseFieldLabel"
import { HintsEditor } from "./HintsEditor"
import { isValidIPv4, type DraftFormValues, type PlaceholderFormValues } from "@/lib/exerciseSchemas"
import type { Difficulty } from "@/api/exercises/versions"
import type { VariableDef } from "@/components/editor/variableUtils"
import { getFlagPolicy, type FlagPolicy } from "@/api/exercises/flagPolicy"
import type { TextFormatType } from "lexical"

const DIFFICULTIES = ["elementary", "trivial", "easy", "medium", "hard", "insane"] as const

/** TaskForm — the fields of one selected task in a variant. */
export function TaskForm({
  variantIndex,
  taskIndex,
  disabled,
}: {
  variantIndex: number
  taskIndex: number
  disabled: boolean
}) {
  const { control, getValues, setValue } = useFormContext<DraftFormValues>()
  const base = `Variants.${variantIndex}.Tasks.${taskIndex}` as const
  // Flag device linking — only devices from THIS variant's topology.
  const devices = useWatch({ control, name: `Variants.${variantIndex}.Topology.Devices` }) ?? []
  const vpnEnabled = useWatch({ control, name: `Variants.${variantIndex}.Topology.VPN.Enabled` })
  const internetEnabled = useWatch({ control, name: `Variants.${variantIndex}.Topology.Internet.Enabled` })
  const placeholders = useWatch({ control, name: `${base}.Placeholders` }) ?? []
  const variables: VariableDef[] = placeholders.filter((placeholder) => {
    if (placeholder.Kind === "vpn.subnet") return vpnEnabled
    if (placeholder.Kind === "internet.subnet") return internetEnabled
    if (placeholder.Kind === "ip") return (placeholder.IPReference === "static" && isValidIPv4(`${placeholder.Octets1to3}.${placeholder.LastOctet}`)) ||
      (placeholder.IPReference === "vpn" && vpnEnabled) || (placeholder.IPReference === "internet" && internetEnabled)
    if (placeholder.Kind === "external.link") return devices.some((device) => device.Name === placeholder.DeviceName && device.External?.Enabled)
    return false
  }).map((placeholder) => {
    const labelKey = placeholder.Kind === "vpn.subnet" ? "admin.exPh.kind.vpnSubnet" :
      placeholder.Kind === "internet.subnet" ? "admin.exPh.kind.internetSubnet" :
      placeholder.Kind === "external.link" ? "admin.exPh.kind.externalLink" : "admin.exPh.kind.ip"
    const example = placeholder.Kind === "external.link" ? exampleLabLink(placeholder.DeviceName || "web") :
      placeholder.Kind === "vpn.subnet" || placeholder.Kind === "internet.subnet" ? "10.0.0.0/24" :
      ipExample(placeholder)
    return { name: placeholder.Key, description: t(labelKey), example }
  })
  const unavailableLabels = Object.fromEntries(placeholders.flatMap((placeholder) => {
    if (placeholder.Kind !== "external.link" || !placeholder.DeviceName) return []
    const device = devices.find((candidate) => candidate.Name === placeholder.DeviceName)
    if (!device) return []
    return [[placeholder.Key, `${t("admin.exPh.device")} «${device.Name}» — ${t("admin.exPh.missing")}`]]
  }))
  const linkable = devices.filter((d) => d.Type === "container")
  const linkedDeviceID = useWatch({ control, name: `${base}.LinkedDeviceID` })
  const missingLinkedDevice = Boolean(linkedDeviceID) && !linkable.some((device) => device.ID === linkedDeviceID)
  const attachmentRef = useRef<AttachmentListHandle>(null)
  const pendingInsert = useRef<((key: string, formats?: TextFormatType[]) => void) | null>(null)
  const pendingInsertFormats = useRef<TextFormatType[]>([])
  const [placeholderOpen, setPlaceholderOpen] = useState(false)
  const [editingPlaceholderKey, setEditingPlaceholderKey] = useState<string | null>(null)
  const editingPlaceholder = placeholders.find((placeholder) => placeholder.Key === editingPlaceholderKey) ?? null
  const [dragDepth, setDragDepth] = useState(0)
  const [policy, setPolicy] = useState<FlagPolicy | null>(null)
  const [policyError, setPolicyError] = useState<{ cause: unknown } | null>(null)
  const [policyRetry, setPolicyRetry] = useState(0)

  useEffect(() => {
    let current = true
    getFlagPolicy().then((next) => {
      if (current) { setPolicy(next); setPolicyError(null) }
    }).catch((cause) => {
      if (current) { setPolicy(null); setPolicyError({ cause }) }
    })
    return () => { current = false }
  }, [policyRetry])

  function hasDraggedFiles(event: React.DragEvent<HTMLDivElement>): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes("Files")
  }

  return (
    <div data-testid="task-drop-zone" className="relative min-w-0 space-y-3"
      onDragEnter={(event) => { if (!disabled && hasDraggedFiles(event)) { event.preventDefault(); setDragDepth((depth) => depth + 1) } }}
      onDragLeave={(event) => { if (hasDraggedFiles(event)) { event.preventDefault(); setDragDepth((depth) => Math.max(0, depth - 1)) } }}
      onDragOver={(event) => { if (!disabled && hasDraggedFiles(event)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy" } }}
      onDrop={(event) => {
        if (disabled || !hasDraggedFiles(event)) return
        event.preventDefault()
        setDragDepth(0)
        const file = event.dataTransfer.files?.[0]
        if (file) void attachmentRef.current?.upload(file)
      }}>
      {dragDepth > 0 && <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 grid place-items-center rounded-md border-2 border-dashed border-primary bg-accent/90 text-sm font-medium text-foreground">{t("admin.exFiles.dropHere")}</div>}
      <section className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        {/* Name grows; Difficulty is a small enum — size it to content, not half the row. */}
        <FormField control={control} name={`${base}.Name`} render={({ field }) => (
          <FormItem className="min-w-56 flex-1 space-y-1">
            <ExerciseFieldLabel labelKey="admin.exTask.name" helpKey="admin.exTask.nameHelp" required form />
            <FormControl><Input {...field} required disabled={disabled} onChange={(event) => {
              field.onChange(event)
              getValues("Variants").forEach((_, index) => {
                if (index !== variantIndex) setValue(`Variants.${index}.Tasks.${taskIndex}.Name`, event.target.value, { shouldDirty: true })
              })
            }} /></FormControl>
            <FormMessage className="min-h-5 leading-5" />
          </FormItem>
        )} />
        <FormField control={control} name={`${base}.Difficulty`} render={({ field }) => (
          <FormItem className="w-40 space-y-1">
            <ExerciseFieldLabel labelKey="admin.exTask.difficulty" helpKey="admin.exTask.difficultyHelp" required form />
            <FormControl>
              <SelectMenu
                value={field.value}
                onChange={(difficulty) => {
                  field.onChange(difficulty)
                  getValues("Variants").forEach((_, index) => {
                    if (index !== variantIndex) {
                      setValue(`Variants.${index}.Tasks.${taskIndex}.Difficulty`, difficulty as Difficulty, { shouldDirty: true })
                    }
                  })
                }}
                disabled={disabled}
                options={DIFFICULTIES.map((d) => ({ value: d, label: t(`admin.ex.difficulty.${d}`) }))}
                className="w-full"
              />
            </FormControl>
            <FormMessage className="min-h-5 leading-5" />
          </FormItem>
        )} />
      </div>

      <div className="space-y-1.5">
        <ExerciseFieldLabel labelKey="admin.exTask.description" helpKey="admin.exTask.descriptionHelp" required />
        {/* Lexical is the one controlled exception: JSON state lives in the form field via Controller. */}
        <Controller
          control={control}
          name={`${base}.Description`}
          render={({ field }) => (
            <RichTextEditor value={field.value} onChange={field.onChange} disabled={disabled} variables={variables} unavailableLabels={unavailableLabels}
              onInsertVariable={(insert, formats) => { pendingInsert.current = insert; pendingInsertFormats.current = formats; setEditingPlaceholderKey(null); setPlaceholderOpen(true) }}
              onEditVariable={(key) => { pendingInsert.current = null; setEditingPlaceholderKey(key); setPlaceholderOpen(true) }} />
          )}
        />
      </div>
      <div className="border-t border-border pt-3">
        <AttachmentList ref={attachmentRef} variantIndex={variantIndex} taskIndex={taskIndex} disabled={disabled} />
      </div>
      </section>

      <section className="border-t border-border pt-3">
      <Controller
        control={control}
        name={`${base}.Flag`}
        render={({ field, fieldState }) => (
          <FlagInput
            value={field.value}
            onChange={field.onChange}
            namePrefix={`${base}.Flag`}
            disabled={disabled}
            errors={Array.isArray(fieldState.error) ? fieldState.error.map((item) => item?.message) : []}
            linkedDeviceID={linkedDeviceID}
            hasLinkableDevice={linkable.length > 0}
            policy={policy}
            policyError={policyError}
            onRetryPolicy={() => { setPolicyError(null); setPolicyRetry((attempt) => attempt + 1) }}
          />
        )}
      />
      </section>

      <HintsEditor variantIndex={variantIndex} taskIndex={taskIndex} disabled={disabled} />

      {(linkable.length > 0 || linkedDeviceID) && <section className="space-y-3 border-t border-border pt-3">
        <h4 className="text-sm font-semibold text-foreground">{t("admin.exTask.flagDelivery")}</h4>
        <div data-testid="flag-delivery-fields" className="flex flex-wrap items-start gap-3">
        <FormField control={control} name={`${base}.LinkedDeviceID`} render={({ field }) => (
          <FormItem data-testid="flag-device-field" className="w-full max-w-md flex-1">
            <ExerciseFieldLabel labelKey="admin.exTask.linkedDevice" helpKey="admin.exTask.linkedDeviceHelp" form />
            <FormControl>
              <SelectMenu
                value={field.value}
                onChange={(value) => {
                  field.onChange(value)
                  if (!value) setValue(`${base}.DeviceFlagVar`, "", { shouldDirty: true })
                }}
                disabled={disabled}
                options={[
                  { value: "", label: t("admin.exTask.linkedDevice.none") },
                  ...(missingLinkedDevice ? [{ value: linkedDeviceID, label: t("admin.exPh.missing"), unavailable: true }] : []),
                  ...linkable.map((d) => ({ value: d.ID, label: d.Name ? `${d.Name} (${d.ID})` : d.ID })),
                ]}
                className="w-full"
              />
            </FormControl>
            <FormMessage className="min-h-5 leading-5" />
            {missingLinkedDevice && <p role="alert" className="text-xs text-destructive">{t("admin.ex.val.linkedDeviceUnavailable")}</p>}
          </FormItem>
        )} />
        {linkedDeviceID && <FormField control={control} name={`${base}.DeviceFlagVar`} render={({ field }) => (
          <FormItem className="w-full max-w-xs flex-1">
            <ExerciseFieldLabel labelKey="admin.exTask.deviceFlagVar" helpKey="admin.exTask.deviceFlagVarHelp" required form />
            <FormControl><Input {...field} disabled={disabled} placeholder={t("admin.exTask.deviceFlagVarPlaceholder")} /></FormControl>
            <FormMessage className="min-h-5 leading-5" />
          </FormItem>
        )} />}
        </div>
      </section>}

      <PlaceholderDialog open={placeholderOpen} onOpenChange={(open) => { setPlaceholderOpen(open); if (!open) pendingInsert.current = null }}
        value={editingPlaceholder}
        topology={{ vpnEnabled: Boolean(vpnEnabled), internetEnabled: Boolean(internetEnabled),
          externalDeviceNames: devices.filter((device) => device.External?.Enabled && device.Name).map((device) => device.Name) }}
        onSave={(next: PlaceholderFormValues) => {
          const key = editingPlaceholderKey ?? next.Key
          const index = placeholders.findIndex((placeholder) => placeholder.Key === key)
          const updated = [...placeholders]
          if (index >= 0) updated[index] = { ...next, Key: key }
          else updated.push({ ...next, Key: key })
          setValue(`${base}.Placeholders`, updated, { shouldDirty: true, shouldValidate: true })
          pendingInsert.current?.(key, pendingInsertFormats.current)
          pendingInsert.current = null
          setPlaceholderOpen(false)
        }} />
    </div>
  )
}
