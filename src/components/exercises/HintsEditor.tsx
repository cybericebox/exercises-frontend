"use client"

import { useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { t } from "@/i18n/t"
import { SelectMenu } from "@/components/ui/select-menu"
import { FieldLabel } from "@/components/ui/field-label"
import RichTextEditor, { type LexicalState, type RichTextEditorProps } from "@/components/editor/RichTextEditor"
import { HINT_LEVELS, type HintLevel } from "@/lib/hintLevels"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { addHint, canAddHint, moveHint, removeHint, setHintLevel } from "@/lib/hintSync"
import { hintPlainText, hintTextToState, stateToHintText } from "@/lib/hintText"
import { MAX_HINTS } from "@/lib/hintLimits"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ExpandableRow } from "@/components/ui/expandable-row"
import { RowActions, type RowAction } from "./RowActions"
import { SectionAddButton } from "./SectionAddButton"
import { FieldError, fieldId, fieldProps } from "./editor/fieldErrors"

const levelOptions = () => HINT_LEVELS.map((level) => ({ value: level, label: t(`exercises.hints.level.${level}`), description: t(`exercises.hints.levelDescription.${level}`) }))
const levelHelp = () => ({
  intro: t("exercises.hints.levelHelp.intro"),
  items: HINT_LEVELS.map((level) => ({ term: t(`exercises.hints.level.${level}`), text: t(`exercises.hints.levelDescription.${level}`) })),
})

/** What the hint text editor shares with the task description editor: the variables, their insert/edit flow, size. */
export type DescriptionEditorConfig = Pick<RichTextEditorProps, "variables" | "unavailableLabels" | "onInsertVariable" | "onEditVariable" | "maxContentHeight">

/**
 * The hint text: the task description's editor, with the same configuration (toolbar, alignment, variables and the
 * preview of their values). Keeps the last editor state so an edit without text (stored as "") does not reset it.
 */
function HintTextEditor({ text, onChange, disabled, invalid, ariaLabel, describedBy, fieldName, config }: { text: string; onChange: (text: string) => void; disabled: boolean; invalid: boolean; ariaLabel: string; describedBy?: string; fieldName: string; config?: DescriptionEditorConfig }) {
  const [local, setLocal] = useState<{ text: string; state: LexicalState | null }>({ text: "", state: null })
  const value = local.text === text && local.state ? local.state : hintTextToState(text)
  return <RichTextEditor {...config} value={value} disabled={disabled} ariaLabel={ariaLabel} ariaDescribedBy={describedBy} invalid={invalid} fieldName={fieldName}
    placeholder={t("exercises.hints.textPlaceholder")}
    onChange={(state) => {
      const next = stateToHintText(state)
      setLocal({ text: next, state })
      if (next !== text) onChange(next)
    }} />
}

/**
 * HintsEditor — a task's hints, as expandable rows (the same affordance as every other expandable row, H13: a chevron in
 * its own column, or a click on the row) that show «1. Натяк  text» and open to edit the level and the text. Count, order
 * and level are shared by every variant (changes apply to all of them); the text is edited per variant. Every row shows
 * its level, open or closed. The text editor is the task description's. A row with an error opens by itself.
 */
export function HintsEditor({ variantIndex, taskIndex, disabled, editor, textsOnly = false }: {
  variantIndex: number
  taskIndex: number
  disabled: boolean
  editor?: DescriptionEditorConfig
  /** A linked variant: the hints are the base's; nothing here changes. */
  textsOnly?: boolean
}) {
  const { control, getValues, setValue, formState } = useFormContext<DraftFormValues>()
  const base = `Variants.${variantIndex}.Tasks.${taskIndex}.Hints` as const
  const hints = useWatch({ control, name: base }) ?? []
  const errors = formState.errors.Variants?.[variantIndex]?.Tasks?.[taskIndex]?.Hints
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set())
  const [removing, setRemoving] = useState<number | null>(null)
  const setOpen = (index: number, open: boolean) => setExpanded((current) => {
    const next = new Set(current)
    if (open) next.add(index); else next.delete(index)
    return next
  })
  const structureLocked = disabled || textsOnly

  function apply(change: (variants: DraftFormValues["Variants"]) => DraftFormValues["Variants"]) {
    const next = change(getValues("Variants"))
    next.forEach((variant, index) => {
      setValue(`Variants.${index}.Tasks.${taskIndex}.Hints`, variant.Tasks[taskIndex]?.Hints ?? [], { shouldDirty: true })
    })
  }

  function move(from: number, to: number) {
    apply((variants) => moveHint(variants, taskIndex, from, to))
    setExpanded((current) => new Set([...current].map((index) => index === from ? to : index === to ? from : index)))
  }
  function remove(at: number) {
    apply((variants) => removeHint(variants, taskIndex, at))
    setExpanded((current) => new Set([...current].filter((index) => index !== at).map((index) => index > at ? index - 1 : index)))
  }
  const add = () => { apply((variants) => addHint(variants, taskIndex)); setExpanded((current) => new Set([...current, hints.length])) }

  const headingId = `hints-${variantIndex}-${taskIndex}`
  return (
    <section className="subtask-hints" aria-labelledby={headingId}>
      <div className="subtask-section-title">
        <FieldLabel as="h4" id={headingId} text={t("exercises.hints.title")} labelClassName="text-sm" help={{ intro: t("exercises.hints.help"), default: t("ed.b.hints.default") }} />
        <span className="text-xs font-normal text-muted-foreground">{hints.length}/{MAX_HINTS}</span>
      </div>
      <FieldError path={base} />
      {hints.length === 0 ? (
        <EmptyState compact message={t("exercises.hints.empty")} className="min-h-0 py-2" />
      ) : (
        <ol className="hint-list rounded-lg border border-border px-1">
          {hints.map((hint, hintIndex) => {
            const hintErrors = Array.isArray(errors) ? errors[hintIndex] : undefined
            const rowOpen = expanded.has(hintIndex) || Boolean(hintErrors)
            const textPath = `${base}.${hintIndex}.Text`
            const levelPath = `${base}.${hintIndex}.Level`
            const words = hintPlainText(hint.Text)
            const actions: RowAction[] = structureLocked ? [] : [
              { key: "up", label: t("exercises.hints.up"), icon: <ArrowUp aria-hidden="true" className="h-4 w-4" />, onSelect: () => move(hintIndex, hintIndex - 1), disabled: hintIndex === 0 },
              { key: "down", label: t("exercises.hints.down"), icon: <ArrowDown aria-hidden="true" className="h-4 w-4" />, onSelect: () => move(hintIndex, hintIndex + 1), disabled: hintIndex === hints.length - 1 },
              { key: "remove", label: t("exercises.hints.remove"), icon: <Trash2 aria-hidden="true" className="h-4 w-4" />, onSelect: () => setRemoving(hintIndex), danger: true },
            ]
            return (
              <li key={`${hint.ID || "new"}-${hintIndex}`} data-testid="hint-row" className="group">
                <ExpandableRow open={rowOpen} onOpenChange={(open) => setOpen(hintIndex, open)} ariaLabel={t("exercises.hints.rowLabel", { n: hintIndex + 1 })}
                  actions={actions.length ? actions : undefined}
                  summary={<span className="flex min-w-0 items-baseline gap-2 text-sm" onClick={rowOpen ? (event) => event.stopPropagation() : undefined}>
                    <span className="hint-row-num shrink-0 tabular-nums">{hintIndex + 1}.</span>
                    <span className="hint-row-level shrink-0 text-muted-foreground">{t(`exercises.hints.level.${hint.Level}`)}</span>
                    {!rowOpen && <span className="hint-row-text min-w-0 truncate">{words || t("exercises.hints.rowEmpty")}</span>}
                    {rowOpen && actions.length > 0 && <RowActions actions={actions} className="ml-auto opacity-100" />}
                  </span>}>
                  <div className="space-y-3 pt-1">
                    <div className="max-w-64 space-y-1">
                      <FieldLabel text={t("exercises.hints.level")} required help={levelHelp()} htmlFor={fieldId(levelPath)} />
                      <SelectMenu {...fieldProps(levelPath, hintErrors?.Level?.message)} value={hint.Level} disabled={structureLocked} ariaLabel={t("exercises.hints.level")} className="w-full"
                        options={levelOptions()} onChange={(level) => apply((variants) => setHintLevel(variants, taskIndex, hintIndex, level as HintLevel))} />
                      <FieldError path={levelPath} />
                    </div>
                    <div className="space-y-1">
                      <FieldLabel as="span" text={t("ed.b.hints.text")} required help={{ intro: t("ed.b.hints.text.help"), default: t("ed.b.hints.text.default") }} />
                      <HintTextEditor text={hint.Text} disabled={disabled} config={editor} invalid={Boolean(hintErrors?.Text)} fieldName={textPath}
                        describedBy={hintErrors?.Text ? `${fieldId(textPath)}-error` : undefined} ariaLabel={t("exercises.hints.textAria", { n: hintIndex + 1 })}
                        onChange={(text) => setValue(`${base}.${hintIndex}.Text`, text, { shouldDirty: true, shouldValidate: Boolean(hintErrors?.Text) })} />
                      <FieldError path={textPath} />
                    </div>
                  </div>
                </ExpandableRow>
              </li>
            )
          })}
        </ol>
      )}
      {!structureLocked && <div className="flex subtask-add-left"><SectionAddButton label={t("exercises.hints.add")} onClick={add}
        blockedReason={canAddHint(hints) ? null : t("exercises.hints.limitReached", { max: MAX_HINTS })} /></div>}
      <ConfirmDialog open={removing !== null} tone="danger" onCancel={() => setRemoving(null)} title={t("admin.ex.removeTitle")} description={t("admin.ex.removeDescription")}
        confirmLabel={t("exercises.hints.remove")} onConfirm={() => { if (removing !== null) remove(removing); setRemoving(null) }} />
    </section>
  )
}
