"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form"
import { LockKeyhole, LockKeyholeOpen, Plus, Upload } from "lucide-react"
import { t } from "@/i18n/t"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { SelectMenu } from "@/components/ui/select-menu"
import { FieldHelp } from "@/components/ui/field-help"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { FormField, FormItem, FormControl, FormMessage } from "@/components/ui/form"
import { InterfaceForm } from "./InterfaceForm"
import { DeviceImageField } from "./ImageUpload"
import { SecretInput } from "./SecretInput"
import { ExerciseFieldLabel } from "./ExerciseFieldLabel"
import { RemoveAction } from "./RemoveAction"
import { useEditorPosition } from "./EditorPosition"
import { useDevicePersistenceAvailable } from "./DevicePersistenceContext"
import { EmptyState } from "@/components/ui/empty-state"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { parseEnvImport, type EnvImportResult } from "@/lib/envImport"
import type { Protocol, SecurityPreset } from "@/api/exercises/versions"
import { selectedPreset } from "@/lib/deviceResources"
import { unitHelp } from "@/lib/presetLabels"
import { useResourcesConfig } from "./ResourcesConfigContext"
import { ResourceSelect } from "./ResourceSelect"
import { LoadingArea } from "@/components/ui/spinner"

const PROTOCOLS: Protocol[] = ["http", "https"]
/** How long the result of an .env import stays on screen. */
const IMPORT_RESULT_MS = 8000
const SECURITY_PRESETS: SecurityPreset[] = ["standard", "extended"]
/** One device with focused settings; switch/hub expose only basic properties. */
export function DeviceCard({
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
  const { control } = useFormContext<DraftFormValues>()
  const base = `Variants.${variantIndex}.Topology.Devices.${deviceIndex}` as const
  const type = useWatch({ control, name: `${base}.Type` })
  const externalEnabled = useWatch({ control, name: `${base}.External.Enabled` })
  const persistenceEnabled = useWatch({ control, name: `${base}.Persistence.Enabled` })
  const persistenceAvailable = useDevicePersistenceAvailable()
  const forwarding = type === "unmanaged-switch" || type === "hub"
  type DevicePanel = "basic" | "interfaces" | "env"
  const [panel, setPanel] = useEditorPosition("devicePanel")
  const externalId = useId()
  const persistenceId = useId()
  const readyFileId = useId()
  const visiblePanel: DevicePanel = forwarding || (panel !== "interfaces" && panel !== "env") ? "basic" : panel
  const sections: DevicePanel[] = forwarding ? [] : ["basic", "interfaces", "env"]

  return (
    <div className="min-w-0">
      <div className={`min-w-0 ${compact ? "space-y-2" : "space-y-4"}`}>
        {sections.length > 0 && <nav aria-label={t("admin.exTopo.deviceSettings")} className={`flex min-w-0 flex-nowrap gap-1 overflow-x-auto border-b border-border ${compact ? "pb-1" : "pb-2"}`}>
          {sections.map((section) => {
            const labelKey = section === "basic" ? "admin.exTopo.basic" : section === "interfaces" ? "admin.exTopo.interfaces" : "admin.exEnv.title"
            return <button key={section} type="button" aria-current={visiblePanel === section ? "page" : undefined}
              onClick={() => setPanel(section)}
              className={`shrink-0 whitespace-nowrap rounded-md px-2.5 py-2 text-left text-sm ${visiblePanel === section ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}>
              {t(labelKey)}
            </button>
          })}
        </nav>}
        <div data-device-basic={visiblePanel === "basic" ? "" : undefined} className={visiblePanel === "basic" ? `min-w-0 ${compact ? "space-y-3" : "space-y-4"}` : "min-w-0"}
          // A missed drop must never open the archive in the browser; the image field takes the real ones.
          onDragOver={(event) => { if (visiblePanel === "basic") event.preventDefault() }}
          onDrop={(event) => { if (visiblePanel === "basic") event.preventDefault() }}>
        {visiblePanel === "basic" && !forwarding && <DeviceImageField variantIndex={variantIndex} deviceIndex={deviceIndex} disabled={disabled} compact={compact} />}
        {visiblePanel === "basic" && !forwarding && <ResourcePicker variantIndex={variantIndex} deviceIndex={deviceIndex} disabled={disabled} compact={compact} />}
        {visiblePanel === "basic" && !forwarding && <FormField control={control} name={`${base}.SecurityPreset`} render={({ field, fieldState }) => (
          <FormItem className={compact ? "space-y-1" : undefined}>
            <ExerciseFieldLabel labelKey="admin.exTopo.securityPreset" form />
            <FormControl><SelectMenu value={field.value || "standard"} onChange={field.onChange} disabled={disabled}
              ariaLabel={t("admin.exTopo.securityPreset")}
              options={SECURITY_PRESETS.map((preset) => ({ value: preset, label: t(`admin.exTopo.security.${preset}`), description: t(`admin.exTopo.security.${preset}Help`) }))}
              className="h-10 w-full" /></FormControl>
            {fieldState.error && <FormMessage className="leading-5" />}
          </FormItem>
        )} />}

        {visiblePanel === "interfaces" &&
          <InterfaceForm variantIndex={variantIndex} deviceIndex={deviceIndex} disabled={disabled} compact={compact} />
        }
        {visiblePanel === "env" &&
          <EnvVarsList variantIndex={variantIndex} deviceIndex={deviceIndex} disabled={disabled} compact={compact} />
        }
        {visiblePanel === "basic" && !forwarding && <hr className="border-t border-border" />}
        {visiblePanel === "basic" && !forwarding && <div className="space-y-2">
          <SwitchRow id={externalId} label={t("admin.exTopo.external")} help={t("admin.exTopo.externalHelp")}>
            <Controller control={control} name={`${base}.External.Enabled`}
              render={({ field }) => <Switch id={externalId} checked={field.value} onCheckedChange={field.onChange} disabled={disabled} />} />
          </SwitchRow>
          {externalEnabled && (
            <div className="grid grid-cols-1 gap-2 @min-[26rem]:grid-cols-2">
              <FormField control={control} name={`${base}.External.Port`} render={({ field, fieldState }) => (
                <FormItem className="space-y-1">
                  <ExerciseFieldLabel labelKey="admin.exTopo.port" helpKey="admin.exTopo.portHelp" required form />
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={65535}
                      required
                      value={field.value}
                      disabled={disabled}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  {fieldState.error && <FormMessage className="leading-5" />}
                </FormItem>
              )} />
              <div className="space-y-1">
                <ExerciseFieldLabel labelKey="admin.exTopo.protocol" required />
                <Controller
                  control={control}
                  name={`${base}.External.Protocol`}
                  render={({ field }) => (
                    <SelectMenu
                      value={field.value}
                      onChange={field.onChange}
                      disabled={disabled}
                      ariaLabel={t("admin.exTopo.protocol")}
                      options={PROTOCOLS.map((p) => ({ value: p, label: p }))}
                      className="h-10 w-full"
                    />
                  )}
                />
              </div>
            </div>
          )}
        </div>}
        {visiblePanel === "basic" && type === "container" &&
          <SwitchRow id={readyFileId} label={t("admin.exTopo.waitReadyFile")} help={t("admin.exTopo.waitReadyFileHelp")}>
            <Controller control={control} name={`${base}.WaitReadyFile`}
              render={({ field }) => <Switch id={readyFileId} checked={field.value ?? false} onCheckedChange={field.onChange} disabled={disabled} />} />
          </SwitchRow>}
        {visiblePanel === "basic" && type === "container" && (persistenceAvailable || persistenceEnabled) &&
          <SwitchRow id={persistenceId} label={t("admin.exTopo.persistence")} help={t("admin.exTopo.persistenceHelp")}>
            <Controller control={control} name={`${base}.Persistence.Enabled`}
              render={({ field }) => <Switch id={persistenceId} checked={field.value ?? false} onCheckedChange={field.onChange} disabled={disabled} />} />
          </SwitchRow>}
        </div>
      </div>
    </div>
  )
}

/** A switch row: the label with its help on the left, the switch on the right. */
function SwitchRow({ id, label, help, children }: { id: string; label: string; help: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3">
    <span className="flex min-w-0 items-center gap-1.5">
      <label htmlFor={id} className="text-sm font-medium leading-5">{label}</label>
      <FieldHelp text={help} />
    </span>
    {children}
  </div>
}

/** The block size of one device: a preset of the platform (a whole number of blocks); presets, the frame and the amounts come from it. */
function ResourcePicker({ variantIndex, deviceIndex, disabled, compact }: {
  variantIndex: number
  deviceIndex: number
  disabled: boolean
  compact: boolean
}) {
  const { control, setValue } = useFormContext<DraftFormValues>()
  const config = useResourcesConfig()
  const base = `Variants.${variantIndex}.Topology.Devices.${deviceIndex}` as const
  const preset = useWatch({ control, name: `${base}.ResourcePreset` })

  return <div data-device-resources className={`min-w-0 ${compact ? "space-y-1" : "space-y-1.5"}`}>
    <ExerciseFieldLabel labelKey="admin.exTopo.resources" helpLines={config ? [unitHelp(config)] : undefined} />
    {config
      ? <ResourceSelect config={config} disabled={disabled} ariaLabel={t("admin.exTopo.resources")}
        value={selectedPreset({ ResourcePreset: preset }, config)}
        onChange={(next) => setValue(`${base}.ResourcePreset`, next, { shouldDirty: true })} />
      : <LoadingArea compact className="h-10" label={t("admin.loading")} />}
  </div>
}

/** EnvVarsList — container environment variables; secrets go through SecretInput. */
function EnvVarsList({
  variantIndex,
  deviceIndex,
  disabled,
  compact,
}: {
  variantIndex: number
  deviceIndex: number
  disabled: boolean
  compact: boolean
}) {
  const { control, trigger } = useFormContext<DraftFormValues>()
  const name = `Variants.${variantIndex}.Topology.Devices.${deviceIndex}.EnvVars` as const
  const { fields, append, remove } = useFieldArray({ control, name })
  const rows = useWatch({ control, name }) ?? []
  const deviceID = useWatch({ control, name: `Variants.${variantIndex}.Topology.Devices.${deviceIndex}.ID` })
  const tasks = useWatch({ control, name: `Variants.${variantIndex}.Tasks` }) ?? []
  const flagBindings = tasks.flatMap((task, taskIndex) => task.LinkedDeviceID === deviceID && task.DeviceFlagVar.trim()
    ? [{ taskIndex, taskName: task.Name, variable: task.DeviceFlagVar }] : [])
  const [, setTask] = useEditorPosition("task")
  const [, setSection] = useEditorPosition("section")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importResult, setImportResult] = useState<EnvImportResult | "read-error" | null>(null)
  // The import line is a passing report: it goes away by itself.
  useEffect(() => {
    if (!importResult) return
    const timer = window.setTimeout(() => setImportResult(null), IMPORT_RESULT_MS)
    return () => window.clearTimeout(timer)
  }, [importResult])

  function addVariable() {
    append({ Name: "", Value: "", Secret: false, HasValue: false })
  }

  async function importFile(file: File | undefined) {
    if (!file) return
    try {
      const occupied = new Set([...rows.map((row) => row.Name.trim()), ...flagBindings.map((binding) => binding.variable.trim())])
      const result = parseEnvImport(await file.text(), occupied)
      if (result.imported.length) append(result.imported)
      setImportResult(result)
    } catch {
      setImportResult("read-error")
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  return (
    <section className={compact ? "space-y-2" : "space-y-3"}>
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{t("admin.exEnv.title")}</h4>
        {!disabled && <div className="flex shrink-0 items-center gap-1.5">
          <input ref={fileInputRef} type="file" accept=".env,text/plain" aria-hidden="true" tabIndex={-1}
            className="hidden" onChange={(event) => void importFile(event.target.files?.[0])} />
          <HoverTooltip text={t("admin.exEnv.importFile")}><Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0"
            aria-label={t("admin.exEnv.importFile")}
            onClick={() => fileInputRef.current?.click()}><Upload className="h-4 w-4" /></Button></HoverTooltip>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addVariable}
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("admin.exEnv.add")}
          </Button>
        </div>}
      </div>
      {importResult && <p role="status" className="text-xs text-muted-foreground">
        {importResult === "read-error" ? t("admin.exEnv.importReadError")
          : t("admin.exEnv.importSummary", { imported: importResult.imported.length, duplicates: importResult.duplicates, invalid: importResult.invalid })}
      </p>}

      {fields.length === 0 && <EmptyState compact message={t("admin.exEnv.empty")} />}
      {fields.length > 0 && <div className={`min-w-0 ${compact ? "space-y-1" : "space-y-2"}`}>
        {fields.map((field, ei) => {
        const isSecret = rows[ei]?.Secret ?? false
        const hasValue = rows[ei]?.HasValue ?? false
        const value = rows[ei]?.Value ?? ""
        // A stored-but-untouched secret (Secret+HasValue, empty Value) must stay a secret:
        // its plaintext is never available client-side, so un-secretting it would silently
        // downgrade/overwrite the stored value. Lock the secret toggle on until the admin
        // supplies a fresh value via SecretInput's "Replace" (Value !== "").
        const lockSecret = isSecret && hasValue && value === ""
        return (
          <div key={field.id} data-env-row role="group" aria-label={t("admin.exEnv.variableN", { n: ei + 1 })}
            className={`relative min-w-0 rounded-md border border-border ${compact ? "p-4" : "p-3"}`}>
            <div data-env-actions className="absolute right-3 top-3 flex items-center gap-1">
              <Controller control={control} name={`${name}.${ei}.Secret`} render={({ field: secretField }) => (
                <HoverTooltip text={lockSecret ? t("admin.exSecret.lockedHint") : t("admin.exEnv.secretHelp")}><button type="button" ref={secretField.ref} aria-label={t("admin.exEnv.secret")}
                  aria-pressed={!!secretField.value}
                  disabled={disabled || lockSecret} onClick={() => secretField.onChange(!secretField.value)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 aria-pressed:bg-primary/10 aria-pressed:text-primary">
                  {secretField.value ? <LockKeyhole className="h-4 w-4" /> : <LockKeyholeOpen className="h-4 w-4" />}
                </button></HoverTooltip>
              )} />
              {!disabled && <RemoveAction ariaLabel={t("admin.exEnv.remove")} onClick={() => remove(ei)} className="h-8 w-8" />}
            </div>
            <div data-env-fields className={`grid min-w-0 ${compact ? "grid-cols-1 gap-2 @min-[40rem]:grid-cols-2" : "gap-2 sm:grid-cols-2"}`}>
              <FormField control={control} name={`${name}.${ei}.Name`} render={({ field: nameField, fieldState }) => (
                <FormItem className="space-y-1">
                  <div className={`flex min-h-8 items-center justify-between gap-2 ${compact ? "pr-20 @min-[40rem]:pr-0" : "pr-20 sm:pr-0"}`}>
                    <ExerciseFieldLabel labelKey="admin.exEnv.name" required form />
                  </div>
                  <FormControl><Input {...nameField} aria-label={t("admin.exEnv.name")} required disabled={disabled} placeholder={t("admin.exEnv.namePlaceholder")}
                    onChange={(event) => { nameField.onChange(event); if (fieldState.error) void trigger(`${name}.${ei}.Name`) }} /></FormControl>
                  {fieldState.error && <FormMessage data-error-slot className="leading-4" />}
                </FormItem>
              )} />
              <FormField
                control={control}
                name={`${name}.${ei}.Value`}
                render={({ field: valueField, fieldState }) => <FormItem className="space-y-1">
                  <div className={`flex min-h-8 items-center ${compact ? "@min-[40rem]:pr-20" : "sm:pr-20"}`}><ExerciseFieldLabel labelKey="admin.exEnv.value" helpKey="admin.exEnv.valueHelp" form /></div>
                  <FormControl>{isSecret ? (
                    <SecretInput
                      value={valueField.value}
                      hasValue={hasValue}
                      onChange={valueField.onChange}
                      disabled={disabled}
                    />
                  ) : (
                    <Input aria-label={t("admin.exEnv.value")} value={valueField.value} onChange={valueField.onChange} disabled={disabled} />
                  )}</FormControl>
                  {fieldState.error && <FormMessage data-error-slot className="leading-4" />}
                </FormItem>}
              />
            </div>
          </div>
        )
        })}
      </div>}
      {flagBindings.length > 0 && <div className="space-y-2 border-t border-border pt-3">
        <h5 className="text-sm font-semibold text-foreground">{t("admin.exEnv.taskFlags")}</h5>
        <p className="text-xs text-muted-foreground">{t("admin.exEnv.taskFlagsHelp")}</p>
        <ul className="divide-y divide-border">
          {flagBindings.map((binding) => <li key={binding.taskIndex} className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-sm">
            <button type="button" className="min-w-0 truncate text-left text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
              onClick={() => { setTask(binding.taskIndex); setSection("tasks") }}>
              {binding.taskName || t("admin.exTask.numbered", { n: binding.taskIndex + 1 })}
            </button>
            <code className="min-w-0 break-all rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">{binding.variable}</code>
          </li>)}
        </ul>
      </div>}
    </section>
  )
}
