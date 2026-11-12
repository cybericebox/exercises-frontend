"use client"

import { useFormContext, useWatch } from "react-hook-form"
import { t } from "@/i18n/t"
import { Switch } from "@/components/ui/switch"
import { FieldLabel } from "@/components/ui/field-label"
import { Segmented } from "@/components/ui/segmented"
import { MAX_INPUT_HINT } from "@/api/exercises/model"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { useEditor } from "../context"
import { useLabSupport } from "../labCapabilities"
import { FieldError } from "../fieldErrors"
import { AnswerValues } from "./AnswerValues"
import { DeliveryBlock } from "./DeliveryBlock"
import { StatePane } from "./StatePane"
import { Field, TextControl } from "./fields"
import { checkChoiceOf, setCheckChoice, type CheckChoice } from "./taskShared"

/**
 * «Перевірка» (D7, D8) — one control, Прапор | Текст | Стан. Flag and text: «Значення» and «Підказка в полі вводу» side by
 * side, and the read-only block «Куди передається відповідь» under them. State: mode, interval, manual run and the
 * conditions. The kind of check is the same in every variant.
 */
export function CheckSection({ variantIndex, taskIndex }: { variantIndex: number; taskIndex: number }) {
  const form = useFormContext<DraftFormValues>()
  const { disabled, baseIndex } = useEditor()
  const linked = baseIndex >= 0
  const lock = disabled || linked
  const checksOff = useLabSupport()("checks")
  const base = `Variants.${variantIndex}.Tasks.${taskIndex}`
  const check = useWatch({ control: form.control, name: `${base}.Check` as `Variants.${number}.Tasks.${number}.Check` })
  const taskKey = useWatch({ control: form.control, name: `${base}.Key` as `Variants.${number}.Tasks.${number}.Key` })
  if (!check) return null
  const choice = checkChoiceOf({ Check: check })
  const options = (["flag", "text", "state"] as CheckChoice[]).map((value) => ({ value, label: t(`ed.b.kind.${value}`) }))
  const kindPath = `${base}.Check.Kind`
  return <section className="subtask-section space-y-3" aria-labelledby={`${base}-check-title`} data-testid="check-section">
    <div className="space-y-1.5">
      <FieldLabel as="h4" id={`${base}-check-title`} text={t("ed.b.check.title")} labelClassName="text-sm" help={{
        intro: t("ed.b.check.help"),
        items: [{ term: t("ed.b.kind.flag"), text: t("ed.b.check.flagHint") }, { term: t("ed.b.kind.text"), text: t("ed.b.check.textHint") }, { term: t("ed.b.kind.state"), text: t("ed.b.check.stateHint") }],
        default: t("ed.b.check.default"),
      }} />
      <div className={lock ? "pointer-events-none opacity-60" : undefined} aria-disabled={lock || undefined}>
        <Segmented value={choice} ariaLabel={t("ed.b.check.kindAria")} options={options} onChange={(next) => { if (!lock && !(next === "state" && checksOff.state === "disabled")) setCheckChoice(form, taskIndex, next as CheckChoice) }} />
      </div>
      {checksOff.state !== "ok" && <p role="status" className="text-xs text-muted-foreground">{checksOff.reason}</p>}
      <FieldError path={kindPath} />
    </div>
    {choice === "state"
      ? <StatePane variantIndex={variantIndex} taskIndex={taskIndex} disabled={lock} />
      : <AnswerPane variantIndex={variantIndex} taskIndex={taskIndex} choice={choice} answer={check.Answer} taskKey={taskKey ?? ""} />}
  </section>
}

function AnswerPane({ variantIndex, taskIndex, choice, answer, taskKey }: { variantIndex: number; taskIndex: number; choice: "flag" | "text"; answer: DraftFormValues["Variants"][number]["Tasks"][number]["Check"]["Answer"]; taskKey: string }) {
  const form = useFormContext<DraftFormValues>()
  const { disabled, baseIndex } = useEditor()
  const linked = baseIndex >= 0
  const lock = disabled || linked
  const base = `Variants.${variantIndex}.Tasks.${taskIndex}`
  const baseValues = baseIndex >= 0 ? form.getValues(`Variants.${baseIndex}.Tasks.${taskIndex}.Check.Answer.Values`) ?? [] : []
  const hintPath = `${base}.Check.Answer.InputHint`
  const inherited = linked && answer.Values.length === 0
  return <div className="space-y-4">
    <div className="grid items-start gap-x-6 gap-y-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))]">
      <AnswerValues variantIndex={variantIndex} taskIndex={taskIndex} type={choice} disabled={disabled} linked={linked} baseValues={baseValues} />
      <div className="min-w-0 space-y-3">
        <Field path={hintPath} label={t("ed.b.answer.inputHint")} help={{ intro: t("ed.b.answer.inputHint.help"), default: t("ed.b.answer.inputHint.default") }}>
          <TextControl path={hintPath} ariaLabel={t("ed.b.answer.inputHint")} disabled={lock} maxLength={MAX_INPUT_HINT}
            placeholder={choice === "flag" ? t("ed.b.answer.inputHint.phFlag") : t("ed.b.answer.inputHint.phText")} />
        </Field>
        {choice === "text" && <div className="space-y-2">
          <ToggleRow id={`${base}-ic`} label={t("ed.b.answer.ignoreCase")} help={{ intro: t("ed.b.answer.ignoreCase.help"), default: t("ed.b.answer.ignoreCase.default") }}
            checked={answer.IgnoreCase} disabled={lock} onChange={(checked) => form.setValue(`${base}.Check.Answer.IgnoreCase` as never, checked as never, { shouldDirty: true })} />
          <ToggleRow id={`${base}-trim`} label={t("ed.b.answer.trim")} help={{ intro: t("ed.b.answer.trim.help"), default: t("ed.b.answer.trim.default") }}
            checked={answer.Trim} disabled={lock} onChange={(checked) => form.setValue(`${base}.Check.Answer.Trim` as never, checked as never, { shouldDirty: true })} />
        </div>}
      </div>
    </div>
    <DeliveryBlock variantIndex={variantIndex} taskKey={taskKey} randomFlag={!inherited && choice === "flag" && answer.Values.length === 0} />
  </div>
}

function ToggleRow({ id, label, help, checked, disabled, onChange }: { id: string; label: string; help: Parameters<typeof FieldLabel>[0]["help"]; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return <div className="flex min-h-6 items-center gap-2">
    <Switch id={id} checked={checked} disabled={disabled} aria-label={label} onCheckedChange={onChange} />
    <FieldLabel text={label} htmlFor={id} help={help} labelClassName="font-normal" />
  </div>
}
