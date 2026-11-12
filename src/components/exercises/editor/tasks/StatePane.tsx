"use client"

import { useState } from "react"
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import { get, useFormContext, useWatch } from "react-hook-form"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { FieldLabel } from "@/components/ui/field-label"
import { EmptyState } from "@/components/ui/empty-state"
import { ExpandableRow } from "@/components/ui/expandable-row"
import { RowActions } from "@/components/exercises/RowActions"
import { OBSERVATION_KINDS, MAX_CONDITIONS } from "@/api/exercises/model"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { emptyCondition, type ConditionFormValues } from "@/lib/editor/schemas/task"
import { useEditorPosition } from "../../EditorPosition"
import { FieldError } from "../fieldErrors"
import { FieldHelp } from "@/components/ui/field-help"
import { ChoiceControl, Field, TextControl } from "./fields"
import { ConditionFields, withKind } from "./ConditionForm"
import { conditionSummary } from "./conditionSummary"
import { KIND_SPEC } from "./conditionSpec"
import { useLabSupport } from "../labCapabilities"
import { firstNodeDeviceId } from "./taskShared"

/**
 * «Стан» — the lab checks the devices itself, the participant types nothing. Mode, «Інтервал перевірки» and the manual run
 * in one compact row; the conditions below, numbered, collapsed to one line each, open to edit (no pencil, H13).
 */
export function StatePane({ variantIndex, taskIndex, disabled }: { variantIndex: number; taskIndex: number; disabled: boolean }) {
  const form = useFormContext<DraftFormValues>()
  const { control, getValues, setValue, formState } = form
  const base = `Variants.${variantIndex}.Tasks.${taskIndex}.Check.State`
  const state = useWatch({ control, name: `${base}.Conditions` as `Variants.${number}.Tasks.${number}.Check.State.Conditions` }) ?? []
  const manual = useWatch({ control, name: `${base}.Manual` as `Variants.${number}.Tasks.${number}.Check.State.Manual` })
  const interval = useWatch({ control, name: `${base}.Interval` as `Variants.${number}.Tasks.${number}.Check.State.Interval` })
  const mode = useWatch({ control, name: `${base}.Mode` as `Variants.${number}.Tasks.${number}.Check.State.Mode` })
  // «Перейти» to a field of a condition lands with that condition expanded (the position holds its index).
  const [positionCondition, setPositionCondition] = useEditorPosition("condition")
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set(state.length === 1 ? [0] : []))

  const conditionsPath = `${base}.Conditions` as `Variants.${number}.Tasks.${number}.Check.State.Conditions`
  const write = (next: ConditionFormValues[]) => setValue(conditionsPath, next, { shouldDirty: true })
  const add = () => {
    const condition = emptyCondition("file", firstNodeDeviceId(form, variantIndex))
    const next = [...getValues(conditionsPath), condition]
    write(next)
    setOpen((current) => new Set(current).add(next.length - 1))
    setPositionCondition(next.length - 1)
  }
  const move = (from: number, to: number) => {
    const next = [...getValues(conditionsPath)]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    write(next)
    setOpen((current) => new Set([...current].map((index) => (index === from ? to : index === to ? from : index))))
  }
  const remove = (index: number) => {
    write(getValues(conditionsPath).filter((_, position) => position !== index))
    setOpen((current) => new Set([...current].filter((position) => position !== index).map((position) => (position > index ? position - 1 : position))))
  }

  const modePath = `${base}.Mode`
  const intervalPath = `${base}.Interval`
  const listError = get(formState.errors, conditionsPath) as { message?: unknown } | undefined
  return <div className="space-y-4" data-testid="state-pane">
    <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
      <Field className="min-w-48 flex-1" path={modePath} label={t("ed.b.state.mode")} help={{ intro: t("ed.b.state.mode.help"), items: [{ term: t("ed.b.state.once"), text: t("ed.b.state.onceHint") }, { term: t("ed.b.state.continuous"), text: t("ed.b.state.continuousHint") }], default: t("ed.b.state.mode.default") }}>
        <ChoiceControl path={modePath} ariaLabel={t("ed.b.state.mode.aria")} disabled={disabled} value={mode ?? "once"}
          options={[{ value: "once", label: t("ed.b.state.once"), description: t("ed.b.state.onceHint") }, { value: "continuous", label: t("ed.b.state.continuous"), description: t("ed.b.state.continuousHint") }]} />
      </Field>
      <Field className="min-w-48 flex-1" path={intervalPath} label={t("ed.b.state.interval")} help={{ intro: t("ed.b.state.interval.help"), default: t("ed.b.state.interval.default") }}>
        <TextControl path={intervalPath} ariaLabel={t("ed.b.state.interval")} disabled={disabled} mono placeholder={t("ed.b.state.interval.ph")} />
      </Field>
      <div className="shrink-0 space-y-1">
        <div className="flex h-9 items-center gap-2 whitespace-nowrap pointer-coarse:h-11">
          <Switch id={`state-manual-${variantIndex}-${taskIndex}`} checked={Boolean(manual)} disabled={disabled} aria-label={t("ed.b.state.manual")}
            onCheckedChange={(checked) => setValue(`${base}.Manual` as never, checked as never, { shouldDirty: true })} />
          <FieldLabel text={t("ed.b.state.manual")} htmlFor={`state-manual-${variantIndex}-${taskIndex}`} labelClassName="font-normal"
            help={{ intro: t("ed.b.state.manual.help"), default: t("ed.b.state.manual.default") }} />
        </div>
      </div>
    </div>
    {!String(interval ?? "").trim().replace(/^0$/, "") && !manual && <p role="status" className="text-xs text-muted-foreground">{t("ed.b.state.neverRuns")}</p>}
    <div className="space-y-2">
      <FieldLabel as="span" id={`${base}-conditions-label`} text={t("ed.b.state.conditions")} help={{ intro: [t("ed.b.state.conditions.help1"), t("ed.b.state.conditions.help2")] }} />
      {state.length === 0
        ? <EmptyState compact message={t("ed.b.state.conditions.empty")} className="min-h-0 py-3" />
        : <div role="list" aria-labelledby={`${base}-conditions-label`} className="rounded-lg border border-border px-1">
          {state.map((condition, index) => <ConditionRow key={index} variantIndex={variantIndex} taskIndex={taskIndex} index={index} count={state.length} condition={condition}
            open={open.has(index) || positionCondition === index} onOpenChange={(next) => { if (!next && positionCondition === index) setPositionCondition(-1); setOpen((current) => { const copy = new Set(current); if (next) copy.add(index); else copy.delete(index); return copy }) }}
            disabled={disabled} onMove={move} onRemove={remove} />)}
        </div>}
      {typeof listError?.message === "string" && <FieldError path={conditionsPath} />}
      {!disabled && <div>
        <Button type="button" variant="outline" size="sm" aria-disabled={state.length >= MAX_CONDITIONS || undefined} onClick={() => { if (state.length < MAX_CONDITIONS) add() }}>
          <Plus aria-hidden="true" className="mr-1 h-4 w-4" />{t("ed.b.state.addCondition")}
        </Button>
      </div>}
    </div>
  </div>
}

function ConditionRow({ variantIndex, taskIndex, index, count, condition, open, onOpenChange, disabled, onMove, onRemove }: {
  variantIndex: number
  taskIndex: number
  index: number
  count: number
  condition: ConditionFormValues
  open: boolean
  onOpenChange: (open: boolean) => void
  disabled: boolean
  onMove: (from: number, to: number) => void
  onRemove: (index: number) => void
}) {
  const { control, getValues, setValue, formState } = useFormContext<DraftFormValues>()
  const base = `Variants.${variantIndex}.Tasks.${taskIndex}.Check.State.Conditions.${index}`
  const devices = (useWatch({ control, name: `Variants.${variantIndex}.Topology.Devices` }) ?? []).filter((device) => device.Type === "node")
  const hasError = Boolean(get(formState.errors, base))
  const isOpen = open || hasError
  const deviceName = devices.find((device) => device.ID === condition.DeviceID)?.Name
  const n = index + 1
  const deviceOptions = [
    ...(condition.DeviceID && !deviceName ? [{ value: condition.DeviceID, label: t("ed.b.cond.deviceMissing"), unavailable: true }] : []),
    ...devices.map((device) => ({ value: device.ID, label: device.Name || t("ed.b.deliver.noDevice") })),
  ]
  const support = useLabSupport()
  // A kind no laboratory runs stays in the list, switched off, with the reason; one only some run says so.
  const kindOptions = OBSERVATION_KINDS.map((kind) => {
    const { state, reason } = support({ observation: kind })
    const sub = t(`ed.b.cond.kind.${KIND_SPEC[kind].stem}.sub`)
    return { value: kind, label: t(`ed.b.cond.kind.${KIND_SPEC[kind].stem}`), description: state === "ok" ? sub : `${sub}. ${reason}`, disabled: state === "disabled" && kind !== condition.Kind }
  })
  const actions = [
    { key: "up", label: t("ed.b.state.conditionUp"), icon: <ArrowUp aria-hidden="true" className="h-4 w-4" />, onSelect: () => onMove(index, index - 1), disabled: index === 0 },
    { key: "down", label: t("ed.b.state.conditionDown"), icon: <ArrowDown aria-hidden="true" className="h-4 w-4" />, onSelect: () => onMove(index, index + 1), disabled: index === count - 1 },
    { key: "remove", label: t("ed.b.state.conditionRemove"), icon: <Trash2 aria-hidden="true" className="h-4 w-4" />, onSelect: () => onRemove(index), danger: true },
  ]
  return <div role="listitem" id={`condition-${variantIndex}-${taskIndex}-${index}`}>
    <ExpandableRow open={isOpen} onOpenChange={onOpenChange} ariaLabel={t("ed.b.state.conditionN", { n })}
      actions={disabled ? undefined : actions}
      summary={isOpen
        ? <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm" onClick={(event) => event.stopPropagation()}>
          <span className="subtasks-num shrink-0" aria-hidden="true">{n}</span>
          <span className="min-w-40 flex-1 sm:max-w-56"><ChoiceControl path={`${base}.DeviceID`} ariaLabel={t("ed.b.cond.deviceN", { n })} disabled={disabled} options={deviceOptions} /></span>
          <span className="min-w-40 flex-1 sm:max-w-64"><ChoiceControl path={`${base}.Kind`} ariaLabel={t("ed.b.cond.kindN", { n })} disabled={disabled} options={kindOptions} value={condition.Kind}
            onChoose={(kind) => setValue(base as never, withKind(getValues(base as never) as unknown as ConditionFormValues, kind as ConditionFormValues["Kind"]) as never, { shouldDirty: true })} /></span>
          <FieldHelp help={{
            intro: [t("ed.b.cond.kind.help"), t("ed.b.cond.device.help"), t("ed.b.cond.kind.readOnly")],
            items: OBSERVATION_KINDS.filter((kind) => KIND_SPEC[kind].runsCode).map((kind) => ({ term: t(`ed.b.cond.kind.${KIND_SPEC[kind].stem}`), text: t("ed.b.cond.kind.runs") })),
            default: t("ed.b.cond.kind.default"),
          }} />
          {!disabled && <RowActions actions={actions} className="ml-auto opacity-100" />}
        </span>
        : <span className="flex min-w-0 items-start gap-2 text-sm"><span className="subtasks-num shrink-0" aria-hidden="true">{n}</span>
          <span className="min-w-0 break-words [overflow-wrap:anywhere]"><b className="font-medium">{deviceName || t("ed.b.cond.noDevice")}</b> · {conditionSummary(condition)}</span></span>}>
      <div className="space-y-3 pt-1">
        <FieldError path={`${base}.DeviceID`} />
        <FieldError path={`${base}.Kind`} />
        <ConditionFields base={base} variantIndex={variantIndex} condition={condition} disabled={disabled} />
        <div className="cond-grid">
          <Field className="cond-cell" path={`${base}.Timeout`} label={t("ed.b.cond.timeout")} help={{ intro: t("ed.b.cond.timeout.help"), default: t("ed.b.cond.timeout.def") }}>
            <TextControl path={`${base}.Timeout`} ariaLabel={t("ed.b.cond.timeout")} disabled={disabled} mono placeholder={t("ed.b.cond.timeout.ph")} />
          </Field>
        </div>
      </div>
    </ExpandableRow>
  </div>
}
