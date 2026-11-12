"use client"

import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react"
import { Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form"
import { LockKeyhole, LockKeyholeOpen, Plus, Upload } from "lucide-react"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/ui/empty-state"
import { MAX_ENV_VARS, type DraftFormValues } from "@/lib/exerciseSchemas"
import { parseEnvFile, planEnvImport, type EnvPlan } from "@/lib/envImport"
import { cn } from "@/utils/cn"
import { ConfirmRemoveAction } from "../../../ConfirmRemoveAction"
import { RefField } from "../../kit"
import { FieldError, fieldProps, useFieldError } from "../../fieldErrors"
import { Block } from "../fields"
import { SecretInput } from "../../../SecretInput"
import type { SectionProps } from "./MainSection"

/** How long the result of an import stays on screen. */
const REPORT_MS = 8000

type Report = { added: number; updated: number; kept: number; invalid: number; skipped: number }

/**
 * «Змінні середовища» of a device: the variables of the service process. Every typed value is masked with an eye (H12);
 * a saved secret shows «Значення збережено» and a replace button (the server never returns it; an empty value on save
 * means "keep"). Import from a `.env` file by button or by dropping the file on the block.
 */
export function EnvBlock({ variantIndex, deviceIndex, disabled, onOpenVariables, requestVariable }: SectionProps & {
  onOpenVariables: () => void
  requestVariable: (insert: (name: string) => void) => void
}) {
  const { control, getValues } = useFormContext<DraftFormValues>()
  const name = `Variants.${variantIndex}.Topology.Devices.${deviceIndex}.Bootstrap.Env` as const
  const { fields, append, remove, replace } = useFieldArray({ control, name })
  const rows = useWatch({ control, name }) ?? []
  const inputRef = useRef<HTMLInputElement>(null)
  const [report, setReport] = useState<Report | "read-error" | null>(null)
  const [pending, setPending] = useState<EnvPlan | null>(null)
  const [dragging, setDragging] = useState(false)
  const full = rows.length >= MAX_ENV_VARS

  useEffect(() => {
    if (!report) return
    const timer = window.setTimeout(() => setReport(null), REPORT_MS)
    return () => window.clearTimeout(timer)
  }, [report])

  function apply(plan: EnvPlan) {
    const current = getValues(name) ?? []
    const room = Math.max(0, MAX_ENV_VARS - current.length)
    const added = plan.added.slice(0, room)
    const next = current.map((row, index) => {
      const update = plan.updated.find((candidate) => candidate.index === index)
      return update ? { ...row, Value: update.value } : row
    })
    replace([...next, ...added])
    setReport({ added: added.length, updated: plan.updated.length, kept: plan.kept.length, invalid: plan.invalid, skipped: plan.added.length - added.length })
  }

  async function importFile(file: File | undefined) {
    if (!file || disabled) return
    try {
      const { entries, invalid } = parseEnvFile(await file.text())
      const plan = planEnvImport(getValues(name) ?? [], entries, invalid)
      if (plan.updated.length > 0) setPending(plan)
      else apply(plan)
    } catch {
      setReport("read-error")
    } finally {
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const hasFiles = (event: React.DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files")
  const pendingSecrets = pending ? pending.updated.filter((update) => rows[update.index]?.Secret).map((update) => update.name) : []

  return <div data-env-block onDragOver={(event) => { if (disabled || !hasFiles(event)) return; event.preventDefault(); setDragging(true) }}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }}
    onDrop={(event) => { if (disabled || !hasFiles(event)) return; event.preventDefault(); setDragging(false); void importFile(event.dataTransfer.files[0]) }}
    className={cn("min-w-0 rounded-md border-t border-border pt-5", dragging && "outline-2 outline-dashed outline-offset-4 outline-primary")}>
    <Block id="env-block" title={t("ed.c.env.title")} count={fields.length}
      help={{ intro: [t("ed.c.h.env1"), t("ed.c.h.env2"), t("ed.c.h.env3")], items: [{ term: t("ed.c.h.envSecret"), text: t("ed.c.h.envSecretText") }, { term: t("ed.c.h.envStored"), text: t("ed.c.h.envStoredText") }] }}
      actions={<button type="button" className="text-[13px] text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary" onClick={onOpenVariables}>{t("ed.c.env.schemaVariables")}</button>}>
      {report && <p role="status" className="text-xs text-muted-foreground">
        {report === "read-error" ? t("ed.c.env.readError")
          : [t("ed.c.env.reportAdded", { n: report.added }), report.updated ? t("ed.c.env.reportUpdated", { n: report.updated }) : "", report.kept ? t("ed.c.env.reportKept", { n: report.kept }) : "",
            report.invalid ? t("ed.c.env.reportInvalid", { n: report.invalid }) : "", report.skipped ? t("ed.c.env.reportSkipped", { n: report.skipped }) : ""].filter(Boolean).join(" · ")}
      </p>}
      <FieldError path={name} />
      {fields.length === 0
        ? <EmptyState compact message={t("ed.c.env.empty")} />
        : <div className="min-w-0 space-y-2.5">
          <div className="grid grid-cols-[minmax(140px,240px)_minmax(0,1fr)_36px_36px] gap-2 text-[13px] text-muted-foreground max-sm:hidden">
            <FieldLabel as="span" text={t("ed.c.env.name")} help={{ intro: t("ed.c.h.envName") }} className="min-h-0 text-[13px]" labelClassName="font-normal text-muted-foreground" /><FieldLabel as="span" text={t("ed.c.env.value")} help={{ intro: [t("ed.c.h.envValue1"), t("ed.c.h.envValue2")] }} className="min-h-0 text-[13px]" labelClassName="font-normal text-muted-foreground" /><span /><span />
          </div>
          {fields.map((field, index) => <EnvRow key={field.id} base={name} variantIndex={variantIndex} index={index} disabled={disabled} onRemove={() => remove(index)} requestVariable={requestVariable} />)}
        </div>}
      {!disabled && <div className="flex flex-wrap gap-2">
        <input ref={inputRef} type="file" accept=".env,text/plain" aria-hidden="true" tabIndex={-1} className="hidden" onChange={(event) => void importFile(event.target.files?.[0])} />
        <BlockedTip reason={full ? t("admin.ex.val.envVarsMax", { max: MAX_ENV_VARS }) : null}>
          <Button type="button" variant="outline" aria-disabled={full || undefined} className="h-7 gap-1.5 px-2.5 text-[13px] aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
            onClick={() => { if (!full) append({ Name: "", Value: "", Secret: false, HasValue: false }) }}><Plus aria-hidden="true" className="h-3.5 w-3.5" />{t("ed.c.env.add")}</Button>
        </BlockedTip>
        <Button type="button" variant="outline" className="h-7 gap-1.5 px-2.5 text-[13px]" onClick={() => inputRef.current?.click()}><Upload aria-hidden="true" className="h-3.5 w-3.5" />{t("ed.c.env.import")}</Button>
      </div>}
    </Block>
    <ConfirmDialog open={pending !== null} onCancel={() => setPending(null)} title={t("ed.c.env.updateTitle")}
      description={pending ? <>
        <span className="block">{t("ed.c.env.updateDescription", { names: pending.updated.map((update) => update.name).join(", ") })}</span>
        {pending.added.length > 0 && <span className="mt-2 block">{t("ed.c.env.importSecretNote", { n: pending.added.length })}</span>}
        {pendingSecrets.length > 0 && <span className="mt-2 block">{t("ed.c.env.updateSecrets", { names: pendingSecrets.join(", ") })}</span>}
      </> : undefined}
      confirmLabel={t("ed.c.env.update")} onConfirm={() => { if (pending) apply(pending); setPending(null) }} />
  </div>
}

function BlockedTip({ reason, children }: { reason: string | null; children: ReactNode }) {
  return reason ? <HoverTooltip text={reason} describe="always">{children as ReactElement}</HoverTooltip> : <>{children}</>
}

function EnvRow({ base, variantIndex, index, disabled, onRemove, requestVariable }: {
  base: `Variants.${number}.Topology.Devices.${number}.Bootstrap.Env`
  variantIndex: number
  index: number
  disabled: boolean
  onRemove: () => void
  requestVariable: (insert: (name: string) => void) => void
}) {
  const { control } = useFormContext<DraftFormValues>()
  const row = useWatch({ control, name: `${base}.${index}` })
  const nameError = useFieldError(`${base}.${index}.Name`)
  const valueError = useFieldError(`${base}.${index}.Value`)
  const secret = row?.Secret ?? false
  const stored = secret && (row?.HasValue ?? false) && (row?.Value ?? "") === ""
  const n = index + 1
  const lockTip = disabled ? t("ed.c.env.secretReadOnly") : stored ? t("ed.c.env.secretLocked") : secret ? t("ed.c.env.secretOn") : t("ed.c.env.secretOff")
  const valueProps = fieldProps(`${base}.${index}.Value`, valueError)

  return <div data-env-row role="group" aria-label={t("ed.c.env.rowN", { n })} className="group min-w-0">
    <div className="grid grid-cols-[minmax(0,1fr)_36px_36px] items-start gap-2 sm:grid-cols-[minmax(140px,240px)_minmax(0,1fr)_36px_36px]">
      <div className="min-w-0 max-sm:col-span-3">
        <Controller control={control} name={`${base}.${index}.Name`} render={({ field }) => <Input {...fieldProps(`${base}.${index}.Name`, nameError)} ref={field.ref} value={field.value} onChange={field.onChange} onBlur={field.onBlur}
          disabled={disabled} aria-label={t("ed.c.env.nameN", { n })} placeholder={t("ed.c.ph.envName")} autoComplete="off" spellCheck={false} className="font-mono text-[13px]" />} />
        <FieldError path={`${base}.${index}.Name`} />
      </div>
      <div className="min-w-0 max-sm:col-span-1">
        <Controller control={control} name={`${base}.${index}.Value`} render={({ field }) => secret
          ? <SecretInput {...valueProps} aria-label={t("ed.c.env.valueN", { n })} value={field.value} hasValue={row?.HasValue ?? false} onChange={field.onChange} disabled={disabled} />
          : <RefField {...valueProps} variantIndex={variantIndex} value={field.value} onValueChange={field.onChange} mask disabled={disabled}
            aria-label={t("ed.c.env.valueN", { n })} placeholder={t("ed.c.env.valuePlaceholder")} onNewVariable={(insert) => requestVariable(insert)} />} />
        <FieldError path={`${base}.${index}.Value`} />
      </div>
      <Controller control={control} name={`${base}.${index}.Secret`} render={({ field }) => <HoverTooltip text={lockTip}>
        <button type="button" aria-label={t("ed.c.env.secretN", { n })} aria-pressed={Boolean(field.value)} aria-disabled={disabled || stored || undefined}
          onClick={() => { if (!disabled && !stored) field.onChange(!field.value) }}
          className="inline-flex h-8 w-8 items-center justify-center justify-self-center self-start mt-0.5 rounded-md text-muted-foreground hover:bg-[var(--ib-hover)] hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-pressed:text-primary">
          {field.value ? <LockKeyhole aria-hidden="true" className="h-4 w-4" /> : <LockKeyholeOpen aria-hidden="true" className="h-4 w-4" />}
        </button>
      </HoverTooltip>} />
      {!disabled
        ? <ConfirmRemoveAction ariaLabel={t("ed.c.env.removeN", { n })} onClick={onRemove} className="h-8 w-8" wrapperClassName="justify-self-center self-start mt-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100" />
        : <span />}
    </div>
  </div>
}

