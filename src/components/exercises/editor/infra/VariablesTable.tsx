"use client"

import { Fragment, useEffect, useRef, useState } from "react"
import { Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form"
import { ChevronRight, Trash2, Upload } from "lucide-react"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { SelectMenu } from "@/components/ui/select-menu"
import { Table, TABLE_CELL, TABLE_HEAD_CELL, TABLE_HEAD_ROW } from "@/components/ui/table"
import { MAX_VARIABLES, TASK_KEY_RE } from "@/api/exercises/model"
import { emptyVariable } from "@/lib/editor/schemas/infra"
import { parseEnvFile, planVariableImport, type VariableImportPlan } from "@/lib/envImport"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { TableHeadHelp } from "./TableHeadHelp"
import { cn } from "@/utils/cn"
import { AddButton, FieldError, MaskedInput, MaskedText, RowActions, fieldProps, useFieldError } from "../kit"
import { InActionsSlot } from "./ActionsSlot"
import { kindOptions } from "./NewVariableDialog"
import { renameVariableRefs } from "./renameRefs"
import { variableUsage, type VariableUse } from "./varUsage"
import { focusFieldSoon } from "./focus"

const REPORT_MS = 8000

/**
 * «Змінні»: the variables of the schema. A row is plain text when closed (the value masked with an eye) and editable only
 * when opened; one is open at a time. «Де використовується» has one chip per place; it opens that exact row.
 */
export function VariablesTable({ variantIndex, disabled, onOpenUse }: { variantIndex: number; disabled: boolean; onOpenUse: (use: VariableUse) => void }) {
  const { control, getValues } = useFormContext<DraftFormValues>()
  const base = `Variants.${variantIndex}.Topology.Variables` as const
  const { fields, append, remove, replace } = useFieldArray({ control, name: base })
  const rows = useWatch({ control, name: base }) ?? []
  const topology = useWatch({ control, name: `Variants.${variantIndex}.Topology` })
  const tasks = useWatch({ control, name: `Variants.${variantIndex}.Tasks` }) ?? []
  const { formState } = useFormContext<DraftFormValues>()
  const errorRows = formState.errors.Variants?.[variantIndex]?.Topology?.Variables
  const firstBad = Array.isArray(errorRows) ? errorRows.findIndex(Boolean) : -1
  const [open, setOpen] = useState(firstBad)
  const [pendingRemoval, setPendingRemoval] = useState<number | null>(null)
  const [plan, setPlan] = useState<VariableImportPlan | null>(null)
  const [report, setReport] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const full = rows.length >= MAX_VARIABLES

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the row with an error opens when the error appears
    if (firstBad >= 0) setOpen(firstBad)
  }, [firstBad])
  useEffect(() => {
    if (!report) return
    const timer = window.setTimeout(() => setReport(null), REPORT_MS)
    return () => window.clearTimeout(timer)
  }, [report])

  function add() {
    let n = rows.length + 1
    while (rows.some((row) => row.Name === `var${n}`)) n++
    append({ ...emptyVariable(), Name: `var${n}` })
    setOpen(rows.length)
    focusFieldSoon(`${base}.${rows.length}.Name`)
  }

  function apply(next: VariableImportPlan) {
    const current = getValues(base) ?? []
    const room = Math.max(0, MAX_VARIABLES - current.length)
    const added = next.added.slice(0, room)
    const merged = current.map((row, index) => {
      const update = next.updated.find((candidate) => candidate.index === index)
      return update ? { ...row, Kind: "value" as const, Text: update.value } : row
    })
    replace([...merged, ...added.map((item) => ({ Name: item.Name, Kind: "value" as const, Text: item.Value }))])
    setOpen(-1)
    setReport(next.added.length || next.updated.length ? t("ed.c.vars.report", { added: added.length, updated: next.updated.length }) : t("ed.c.vars.reportEmpty"))
  }

  async function importFile(file: File | undefined) {
    if (!file || disabled) return
    try {
      const { entries, invalid } = parseEnvFile(await file.text())
      const next = planVariableImport(getValues(base) ?? [], entries, invalid)
      if (next.updated.length > 0 || next.fixed.length > 0 || next.skipped.length > 0) setPlan(next)
      else apply(next)
    } catch {
      setReport(t("ed.c.env.readError"))
    } finally {
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const hasFiles = (event: React.DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files")
  const removing = pendingRemoval !== null ? rows[pendingRemoval] : null
  const removingUse = removing && topology ? variableUsage(variantIndex, topology, tasks, removing.Name) : []

  return <div className={cn("flex min-h-0 min-w-0 flex-col gap-2 rounded-md", dragging && "outline-2 outline-dashed outline-offset-2 outline-primary")}
    onDragOver={(event) => { if (disabled || !hasFiles(event)) return; event.preventDefault(); setDragging(true) }}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }}
    onDrop={(event) => { if (disabled || !hasFiles(event)) return; event.preventDefault(); setDragging(false); void importFile(event.dataTransfer.files[0]) }}>
    <InActionsSlot>
      {!disabled && <>
        <input ref={inputRef} type="file" accept=".env,text/plain" aria-hidden="true" tabIndex={-1} className="hidden" onChange={(event) => void importFile(event.target.files?.[0])} />
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}><Upload aria-hidden="true" className="mr-1 h-4 w-4" />{t("ed.c.env.import")}</Button>
        <AddButton label={t("ed.c.vars.add")} onClick={add} blockedReason={full ? t("ed.c.val.variablesMax", { max: MAX_VARIABLES }) : null} />
      </>}
    </InActionsSlot>
    {report && <p role="status" className="text-xs text-muted-foreground">{report}</p>}
    <FieldError path={base} />
    {fields.length === 0
      ? <div className="flex min-h-48 flex-1 items-center justify-center rounded-md border border-border"><EmptyState message={t("ed.c.vars.empty")} /></div>
      : <Table label={t("ed.c.vars.title")} className="min-w-[44rem] table-fixed" regionClassName="rounded-md border border-border">
        <colgroup><col className="w-11" /><col className="w-[20%]" /><col className="w-[21%]" /><col className="w-[26%]" /><col /><col className="w-14" /></colgroup>
        <thead>
          <tr className={TABLE_HEAD_ROW}>
            <th scope="col" className={cn(TABLE_HEAD_CELL, "px-0")}><span className="sr-only">{t("ed.ui.expand")}</span></th>
            <th scope="col" className={TABLE_HEAD_CELL}><TableHeadHelp text={t("ed.c.vars.name")} help={{ intro: t("ed.c.th.varName") }} /></th>
            <th scope="col" className={TABLE_HEAD_CELL}><TableHeadHelp text={t("ed.c.vars.kind")} help={{ intro: t("ed.c.th.kind"), items: [{ term: t("ed.c.th.kindConst"), text: t("ed.c.th.kindConstText") }, { term: t("ed.c.th.kindRandom"), text: t("ed.c.th.kindRandomText") }] }} /></th>
            <th scope="col" className={TABLE_HEAD_CELL}><TableHeadHelp text={t("ed.c.vars.valueOrTemplate")} help={{ intro: t("ed.c.th.value"), items: [{ term: t("ed.c.th.valueRandom"), text: t("ed.c.th.valueRandomText") }] }} /></th>
            <th scope="col" className={TABLE_HEAD_CELL}><TableHeadHelp text={t("ed.c.vars.usedIn")} help={{ intro: t("ed.c.th.usedIn") }} /></th>
            <th scope="col" className={cn(TABLE_HEAD_CELL, "px-1")}><span className="sr-only">{t("admin.exTopo.overview.actions")}</span></th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field, index) => <VariableRow key={field.id} base={base} index={index} open={open === index} onToggle={() => setOpen(open === index ? -1 : index)}
            row={rows[index]} variantIndex={variantIndex} disabled={disabled} used={topology ? variableUsage(variantIndex, topology, tasks, rows[index]?.Name ?? "") : []}
            onOpenUse={onOpenUse} onRemove={() => setPendingRemoval(index)} />)}
        </tbody>
      </Table>}
    <ConfirmDialog open={pendingRemoval !== null} onCancel={() => setPendingRemoval(null)} tone="danger" title={t("ed.c.vars.removeTitle")}
      description={removing ? (removingUse.length ? t("ed.c.vars.removeUsed", { name: removing.Name, n: removingUse.length }) : t("ed.c.vars.removeFree", { name: removing.Name })) : undefined}
      confirmLabel={t("ed.c.vars.remove")} onConfirm={() => { if (pendingRemoval !== null) remove(pendingRemoval); setPendingRemoval(null); setOpen(-1) }} />
    <ConfirmDialog open={plan !== null} onCancel={() => setPlan(null)} title={plan && plan.updated.length ? t("ed.c.vars.importUpdateTitle") : t("ed.c.vars.importTitle")}
      description={plan ? <ImportNotes plan={plan} /> : undefined} confirmLabel={plan && plan.updated.length ? t("ed.c.env.update") : t("ed.c.vars.importConfirm")}
      onConfirm={() => { if (plan) apply(plan); setPlan(null) }} />
  </div>
}

function ImportNotes({ plan }: { plan: VariableImportPlan }) {
  const because = (list: string[]) => list.map((item) => t(`ed.c.vars.fix.${item}`)).join(", ")
  return <>
    {plan.updated.length > 0 && <span className="block">{t("ed.c.vars.importUpdated", { names: plan.updated.map((item) => item.name).join(", ") })}</span>}
    {plan.fixed.length > 0 && <span className="mt-2 block">{t("ed.c.vars.importFixed", { items: plan.fixed.map((fix) => `${fix.from} → ${fix.to} (${because(fix.because)})`).join("; ") })}</span>}
    {plan.skipped.length > 0 && <span className="mt-2 block">{t("ed.c.vars.importSkipped", { items: plan.skipped.map((skip) => `${skip.name} (${t(`ed.c.vars.skip.${skip.because}`)})`).join("; ") })}</span>}
  </>
}

function VariableRow({ base, index, open, onToggle, row, variantIndex, disabled, used, onOpenUse, onRemove }: {
  base: `Variants.${number}.Topology.Variables`
  index: number
  open: boolean
  onToggle: () => void
  row: DraftFormValues["Variants"][number]["Topology"]["Variables"][number] | undefined
  variantIndex: number
  disabled: boolean
  used: VariableUse[]
  onOpenUse: (use: VariableUse) => void
  onRemove: () => void
}) {
  const form = useFormContext<DraftFormValues>()
  const { control, setValue, getValues } = form
  const path = `${base}.${index}`
  const [draft, setDraft] = useState<string | null>(null)
  const nameFormError = useFieldError(`${path}.Name`)
  const textError = useFieldError(`${path}.Text`)
  if (!row) return null
  const template = row.Kind === "template"
  const others = (getValues(base) ?? []).filter((_, other) => other !== index).map((variable) => variable.Name)
  const draftError = draft === null ? "" : draft === "" ? t("ed.c.val.variableName") : !TASK_KEY_RE.test(draft) ? t("ed.b.val.keyFormat") : others.includes(draft) ? t("ed.c.val.variableDuplicate") : ""
  const nameError = draftError || nameFormError
  const lineError = nameError || textError

  /** A valid name is applied at once and the references to the old one follow; an invalid one stays a draft with its error. */
  function rename(next: string) {
    setDraft(next)
    if (next === "" || !TASK_KEY_RE.test(next) || others.includes(next)) return
    const previous = getValues(`${path}.Name` as `Variants.${number}.Topology.Variables.${number}.Name`)
    setValue(`${path}.Name` as `Variants.${number}.Topology.Variables.${number}.Name`, next, { shouldDirty: true, shouldValidate: true })
    renameVariableRefs(form, variantIndex, previous, next)
    setDraft(null)
  }

  const chips = used.length
    ? <div className="flex flex-wrap gap-1">{used.map((use, i) => {
      const label = use.kind === "device"
        ? `${use.deviceName} · ${use.what.key === "env" ? t("ed.c.vars.useEnv", { name: use.what.name }) : use.what.key === "file" ? t("ed.c.vars.useFile", { path: use.what.name }) : t("ed.c.vars.useScript")}`
        : `${use.taskName || t("ed.c.panel.taskN", { n: use.taskIndex + 1 })} · ${t("ed.c.vars.useCondition", { n: use.conditionIndex + 1 })}`
      return <button key={i} type="button" onClick={() => onOpenUse(use)} aria-label={t("ed.c.vars.openUse", { place: label })}
        className="max-w-full truncate rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-foreground hover:bg-[var(--ib-hover)] focus-visible:outline-2 focus-visible:outline-primary">{label}</button>
    })}</div>
    : <span className="text-muted-foreground">{t("ed.c.vars.nowhere")}</span>

  const chevron = <button type="button" aria-expanded={open} aria-label={`${open ? t("ed.ui.collapse") : t("ed.ui.expand")}: ${row.Name}`} onClick={onToggle}
    className="flex h-9 w-10 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary">
    <ChevronRight aria-hidden="true" className={cn("h-4 w-4 transition-transform motion-reduce:transition-none", open && "rotate-90")} />
  </button>
  const trash = !disabled && <RowActions actions={[{ key: "remove", label: t("ed.c.vars.removeN", { name: row.Name }), icon: <Trash2 aria-hidden="true" className="h-4 w-4" />, danger: true, onSelect: onRemove }]} />

  if (!open) {
    return <Fragment>
      <tr data-variable-row className={cn("group h-[49px] cursor-default transition-colors hover:bg-[var(--ib-hover)]", lineError && "bg-destructive/5")}
        onClick={(event) => { if (!(event.target as HTMLElement).closest("a,button,input")) onToggle() }}>
        <td className={cn(TABLE_CELL, "px-0")}>{chevron}</td>
        <td className={cn(TABLE_CELL, "font-mono text-[13px]")}>{row.Name || <span className="text-muted-foreground">{t("ed.c.vars.noName")}</span>}</td>
        <td className={TABLE_CELL}>{t(template ? "ed.c.vars.kindTemplate" : "ed.c.vars.kindValue")}</td>
        <td className={TABLE_CELL}><MaskedText value={row.Text} className="font-mono text-[13px]" /></td>
        <td className={TABLE_CELL}>{chips}</td>
        <td className={cn(TABLE_CELL, "px-1")}>{trash}</td>
      </tr>
      {lineError && <tr><td className="px-0" /><td colSpan={5} className="px-3 pb-2"><FieldError path={`${path}.Name`} message={lineError} /></td></tr>}
    </Fragment>
  }
  const nameProps = fieldProps(`${path}.Name`, nameError)
  const textProps = fieldProps(`${path}.Text`, textError)
  return <tr data-variable-row data-open className="group align-top">
    <td className={cn(TABLE_CELL, "px-0 pt-2")}>{chevron}</td>
    <td className={cn(TABLE_CELL, "py-2")}>
      <Input {...nameProps} value={draft ?? row.Name} disabled={disabled} aria-label={t("ed.c.vars.nameOf")} placeholder={t("ed.c.vars.namePlaceholder")} autoComplete="off" spellCheck={false} className="font-mono text-[13px]" onChange={(event) => rename(event.target.value)} />
      <FieldError path={`${path}.Name`} message={nameError || undefined} />
    </td>
    <td className={cn(TABLE_CELL, "py-2")}>
      <Controller control={control} name={`${path}.Kind` as `Variants.${number}.Topology.Variables.${number}.Kind`} render={({ field }) => <SelectMenu value={field.value} disabled={disabled} ariaLabel={t("ed.c.vars.kind")} options={kindOptions()} className="w-full" menuClassName="w-[22rem] max-w-[90vw]"
        onChange={(next) => {
          const wasTemplate = field.value === "template"
          field.onChange(next)
          if (next === "template" && !wasTemplate) setValue(`${path}.Text` as `Variants.${number}.Topology.Variables.${number}.Text`, "[a-z0-9]{16}", { shouldDirty: true, shouldValidate: true })
          if (next === "value" && wasTemplate) setValue(`${path}.Text` as `Variants.${number}.Topology.Variables.${number}.Text`, "", { shouldDirty: true, shouldValidate: true })
        }} />} />
    </td>
    <td className={cn(TABLE_CELL, "py-2")}>
      <Controller control={control} name={`${path}.Text` as `Variants.${number}.Topology.Variables.${number}.Text`} render={({ field }) => <MaskedInput {...textProps} value={field.value} onChange={(event) => field.onChange(event.target.value)} onBlur={field.onBlur} disabled={disabled}
        aria-label={template ? t("ed.c.vars.template") : t("ed.c.vars.value")} placeholder={template ? "[a-z0-9]{16}" : t("ed.c.vars.valuePlaceholder")} spellCheck={false} className="font-mono text-[13px]" />} />
      <FieldError path={`${path}.Text`} />
    </td>
    <td className={cn(TABLE_CELL, "py-2.5")}>{chips}</td>
    <td className={cn(TABLE_CELL, "px-1 pt-2")}>{trash}</td>
  </tr>
}

