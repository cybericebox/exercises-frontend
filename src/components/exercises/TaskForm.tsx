"use client"

import { exampleLabLink } from "@/lib/labId"
import { ipExample } from "@/lib/placeholderLink"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { Flag } from "lucide-react"
import { Controller, useFormContext, useWatch } from "react-hook-form"
import { t } from "@/i18n/t"
import { Input } from "@/components/ui/input"
import { SelectMenu } from "@/components/ui/select-menu"
import { FormField, FormItem, FormControl, FormMessage } from "@/components/ui/form"
import RichTextEditor from "@/components/editor/RichTextEditor"
import { GuideLink } from "./GuideLink"
import { AttachmentList, type AttachmentListHandle } from "./AttachmentList"
import { FlagInput } from "./FlagInput"
import { PlaceholderDialog } from "./PlaceholderDialog"
import { ExerciseFieldLabel } from "./ExerciseFieldLabel"
import { HintsEditor } from "./HintsEditor"
import { richTextHasContent } from "@/lib/hintText"
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
  linked,
  menu,
}: {
  variantIndex: number
  taskIndex: number
  disabled: boolean
  /** A linked variant: only the flag and the files are its own; the rest comes from the base. */
  linked: boolean
  /** The subtask's actions (order, removal) beside its difficulty. */
  menu?: ReactNode
}) {
  const { control, getValues, setValue, clearErrors } = useFormContext<DraftFormValues>()
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
    return [[placeholder.Key, t("admin.exPh.deviceMissing", { name: device.Name })]]
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
  const [policy, setPolicy] = useState<FlagPolicy | null>(null)
  const [policyError, setPolicyError] = useState<{ cause: unknown } | null>(null)
  const [policyRetry, setPolicyRetry] = useState(0)
  const inheritedDisabled = disabled || linked

  useEffect(() => {
    let current = true
    getFlagPolicy().then((next) => {
      if (current) { setPolicy(next); setPolicyError(null) }
    }).catch((cause) => {
      if (current) { setPolicy(null); setPolicyError({ cause }) }
    })
    return () => { current = false }
  }, [policyRetry])

  return (
    <div data-testid="task-drop-zone" className="subtask-form">
      <section className="subtask-fields">
      <div className="subtask-head">
        {/* Name grows; Difficulty is a small enum — size it to content, not half the row. */}
        <FormField control={control} name={`${base}.Name`} render={({ field }) => (
          <FormItem className="min-w-0 space-y-1">
            <ExerciseFieldLabel labelKey="admin.exTask.name" required form />
            <FormControl><Input {...field} required disabled={inheritedDisabled} onChange={(event) => {
              field.onChange(event)
              getValues("Variants").forEach((_, index) => {
                if (index !== variantIndex) setValue(`Variants.${index}.Tasks.${taskIndex}.Name`, event.target.value, { shouldDirty: true })
              })
            }} /></FormControl>
            <FormMessage className="leading-5" />
          </FormItem>
        )} />
        <FormField control={control} name={`${base}.Difficulty`} render={({ field }) => (
          <FormItem className="min-w-0 space-y-1">
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
                disabled={inheritedDisabled}
                options={DIFFICULTIES.map((d) => ({ value: d, label: t(`admin.ex.difficulty.${d}`) }))}
                className="w-full"
              />
            </FormControl>
            <FormMessage className="leading-5" />
          </FormItem>
        )} />
        {menu && <div className="subtask-menu">{menu}</div>}
      </div>

      <div className="space-y-1.5">
        <ExerciseFieldLabel labelKey="admin.exTask.description" helpKey="admin.exTask.descriptionHelp" required />
        {/* Lexical is the one controlled exception: JSON state lives in the form field via Controller. */}
        <Controller
          control={control}
          name={`${base}.Description`}
          render={({ field, fieldState }) => (
            <>
            <RichTextEditor maxContentHeight={320} fieldName={field.name} invalid={Boolean(fieldState.error)} ariaLabel={t("admin.exTask.description")} ariaDescribedBy={fieldState.error ? `task-description-${variantIndex}-${taskIndex}-error` : undefined} value={field.value} onChange={(value) => { field.onChange(value); if (fieldState.error && richTextHasContent(value)) clearErrors(`${base}.Description`) }} disabled={inheritedDisabled} variables={variables} unavailableLabels={unavailableLabels}
              onInsertVariable={(insert, formats) => { pendingInsert.current = insert; pendingInsertFormats.current = formats; setEditingPlaceholderKey(null); setPlaceholderOpen(true) }}
              onEditVariable={(key) => { pendingInsert.current = null; setEditingPlaceholderKey(key); setPlaceholderOpen(true) }} />
            {fieldState.error?.message && <p id={`task-description-${variantIndex}-${taskIndex}-error`} role="alert" className="text-xs font-medium text-destructive">{fieldState.error.message}</p>}
            </>
          )}
        />
      </div>
      <AttachmentList ref={attachmentRef} variantIndex={variantIndex} taskIndex={taskIndex} disabled={disabled} />
      </section>

      <section className="subtask-flag" aria-labelledby={`flag-title-${variantIndex}-${taskIndex}`}>
      <div className="subtask-flag-title">
        <Flag aria-hidden="true" className="h-4 w-4" />
        <h4 id={`flag-title-${variantIndex}-${taskIndex}`}>{t("admin.exTask.flag.title")}</h4>
        <GuideLink topic="prapory" />
      </div>
      <div className="subtask-flag-box">
      <div data-testid="flag-delivery-fields" className="subtask-flag-delivery">
        {linkable.length > 0 || linkedDeviceID ? <>
        <FormField control={control} name={`${base}.LinkedDeviceID`} render={({ field }) => (
          <FormItem data-testid="flag-device-field" className="flex flex-wrap items-center gap-2 space-y-0">
            <ExerciseFieldLabel labelKey="admin.exTask.linkedDevice" helpKey="admin.exTask.linkedDeviceHelp" form />
            <FormControl>
              <SelectMenu
                value={field.value}
                onChange={(value) => {
                  field.onChange(value)
                  if (!value) setValue(`${base}.DeviceFlagVar`, "", { shouldDirty: true })
                }}
                disabled={inheritedDisabled}
                options={[
                  { value: "", label: t("admin.exTask.linkedDevice.none") },
                  ...(missingLinkedDevice ? [{ value: linkedDeviceID, label: t("admin.exPh.missing"), unavailable: true }] : []),
                  ...linkable.map((d) => ({ value: d.ID, label: d.Name || d.ID })),
                ]}
                className="w-52"
              />
            </FormControl>
            {missingLinkedDevice && <p role="alert" className="basis-full text-xs text-destructive">{t("admin.ex.val.linkedDeviceUnavailable")}</p>}
            <FormMessage className="basis-full leading-5" />
          </FormItem>
        )} />
        {linkedDeviceID && <FormField control={control} name={`${base}.DeviceFlagVar`} render={({ field }) => (
          <FormItem className="flex flex-wrap items-center gap-2 space-y-0">
            <ExerciseFieldLabel labelKey="admin.exTask.deviceFlagVar" helpKey="admin.exTask.deviceFlagVarHelp" required form />
            <FormControl><Input {...field} disabled={inheritedDisabled} className="w-40 font-mono" placeholder={t("admin.exTask.deviceFlagVarPlaceholder")} /></FormControl>
            <FormMessage className="basis-full leading-5" />
          </FormItem>
        )} />}
        </> : <p className="text-xs text-muted-foreground">{t("admin.exTask.flag.noDeviceHint")}</p>}
      </div>
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
      </div>
      </section>

      <HintsEditor variantIndex={variantIndex} taskIndex={taskIndex} disabled={inheritedDisabled} />

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
