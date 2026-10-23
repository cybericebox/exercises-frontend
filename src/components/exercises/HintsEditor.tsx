"use client"

import { useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { SelectMenu } from "@/components/ui/select-menu"
import RichTextEditor, { type LexicalState, type RichTextEditorProps } from "@/components/editor/RichTextEditor"
import { HINT_LEVELS, type HintLevel } from "@/lib/hintLevels"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { addHint, canAddHint, moveHint, removeHint, setHintLevel } from "@/lib/hintSync"
import { hintPlainText, hintTextToState, stateToHintText } from "@/lib/hintText"
import { cn } from "@/utils/cn"
import { MAX_HINTS } from "@/lib/hintLimits"
import { GuideLink } from "./GuideLink"
import { ExerciseFieldLabel } from "./ExerciseFieldLabel"
import { ConfirmRemoveAction as RemoveAction } from "./ConfirmRemoveAction"
import { SectionAddButton } from "./SectionAddButton"

const levelOptions = () => HINT_LEVELS.map((level) => ({ value: level, label: t(`exercises.hints.level.${level}`) }))
const levelHelpLines = () => [
  t("exercises.hints.help"),
  t("exercises.hints.levelHelp.intro"),
  ...HINT_LEVELS.map((level) => t("exercises.hints.levelHelp.item", {
    level: t(`exercises.hints.level.${level}`),
    description: t(`exercises.hints.levelDescription.${level}`),
  })),
]

/** What the hint text editor shares with the task description editor: the variables, their insert/edit flow, size. */
export type DescriptionEditorConfig = Pick<RichTextEditorProps, "variables" | "unavailableLabels" | "onInsertVariable" | "onEditVariable" | "maxContentHeight">

/**
 * The hint text: the task description's editor, with the same configuration (toolbar, alignment, variables and the
 * preview of their values). Keeps the last editor state so an edit without text (stored as "") does not reset it.
 */
function HintTextEditor({ text, onChange, disabled, invalid, ariaLabel, describedBy, config }: { text: string; onChange: (text: string) => void; disabled: boolean; invalid: boolean; ariaLabel: string; describedBy?: string; config?: DescriptionEditorConfig }) {
  const [local, setLocal] = useState<{ text: string; state: LexicalState | null }>({ text: "", state: null })
  const value = local.text === text && local.state ? local.state : hintTextToState(text)
  return <RichTextEditor {...config} value={value} disabled={disabled} ariaLabel={ariaLabel} ariaDescribedBy={describedBy} invalid={invalid}
    placeholder={t("exercises.hints.textPlaceholder")}
    onChange={(state) => {
      const next = stateToHintText(state)
      setLocal({ text: next, state })
      if (next !== text) onChange(next)
    }} />
}

/**
 * HintsEditor — a task's hints, as collapsed rows («⌄ 1. text · рівень: натяк») that open to edit («⌃ 1. [рівень]»
 * with the text editor below). Count, order and level are shared by every variant (changes apply to all of them);
 * the text is edited per variant tab. The price of a hint is set on the event, not here. Level and text are
 * required: the level defaults to nudge (as a task's difficulty defaults to easy); text is checked at publish.
 * The text editor is the task description's (`editor`). «+ Додати підказку» is in the section header.
 */
export function HintsEditor({ variantIndex, taskIndex, disabled, editor }: { variantIndex: number; taskIndex: number; disabled: boolean; editor?: DescriptionEditorConfig }) {
  const { control, getValues, setValue, formState } = useFormContext<DraftFormValues>()
  const base = `Variants.${variantIndex}.Tasks.${taskIndex}.Hints` as const
  const hints = useWatch({ control, name: base }) ?? []
  const errors = formState.errors.Variants?.[variantIndex]?.Tasks?.[taskIndex]?.Hints
  // Hints are collapsed rows; one opens to edit. A new hint opens at once, a hint with an error stays open.
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set())
  const toggle = (index: number) => setExpanded((current) => {
    const next = new Set(current)
    if (next.has(index)) next.delete(index); else next.add(index)
    return next
  })

  function apply(change: (variants: DraftFormValues["Variants"]) => DraftFormValues["Variants"]) {
    const next = change(getValues("Variants"))
    next.forEach((variant, index) => {
      setValue(`Variants.${index}.Tasks.${taskIndex}.Hints`, variant.Tasks[taskIndex]?.Hints ?? [], { shouldDirty: true })
    })
  }

  // Expanded rows follow a move or a removal (by position).
  function move(from: number, to: number) {
    apply((variants) => moveHint(variants, taskIndex, from, to))
    setExpanded((current) => new Set([...current].map((index) => index === from ? to : index === to ? from : index)))
  }
  function remove(at: number) {
    apply((variants) => removeHint(variants, taskIndex, at))
    setExpanded((current) => new Set([...current].filter((index) => index !== at).map((index) => index > at ? index - 1 : index)))
  }

  const listError = errors && !Array.isArray(errors) ? (errors as { message?: string }).message : undefined

  const add = () => { apply((variants) => addHint(variants, taskIndex)); setExpanded((current) => new Set([...current, hints.length])) }
  const headingId = `hints-${variantIndex}-${taskIndex}`

  return (
    <section className="subtask-hints" aria-labelledby={headingId}>
      <div className="subtask-section-title">
        <h4 id={headingId}>{t("exercises.hints.title")}</h4>
        <span className="text-xs font-normal text-muted-foreground">{hints.length}/{MAX_HINTS}</span>
        <GuideLink topic="pidkazky" />
        {!disabled && <SectionAddButton label={t("exercises.hints.add")} onClick={add}
          blockedReason={canAddHint(hints) ? null : t("exercises.hints.limitReached", { max: MAX_HINTS })} />}
      </div>
      {listError && <p role="alert" className="text-xs text-destructive">{listError}</p>}
      {hints.length === 0 ? (
        <EmptyState compact message={t("exercises.hints.empty")} className="min-h-0 py-2" />
      ) : (
        <ol className="hint-list">
          {hints.map((hint, hintIndex) => {
            const hintErrors = Array.isArray(errors) ? errors[hintIndex] : undefined
            const open = expanded.has(hintIndex) || Boolean(hintErrors)
            const panelId = `${base}-${hintIndex}-panel`
            const levelErrorId = `${base}-${hintIndex}-level-error`
            const words = hintPlainText(hint.Text)
            return (
              <li key={`${hint.ID || "new"}-${hintIndex}`} data-testid="hint-row" className={cn("hint-row group", open && "hint-row-open")}>
                {/* The whole header toggles the row; its controls (level, actions) keep their own clicks. */}
                <div className="hint-row-head" onClick={(event) => {
                  if (event.target === event.currentTarget || !(event.target as Element).closest("button, input, [role=combobox], [role=menu], a, label")) toggle(hintIndex)
                }}>
                  <button type="button" className="hint-row-toggle" aria-expanded={open} aria-controls={panelId}
                    aria-label={t("exercises.hints.rowLabel", { n: hintIndex + 1 })} onClick={() => toggle(hintIndex)}>
                    <ChevronDown aria-hidden="true" className="hint-row-chevron h-4 w-4" />
                    <span className="hint-row-num">{hintIndex + 1}.</span>
                    {!open && <>
                      <span className="hint-row-text">{words || t("exercises.hints.rowEmpty")}</span>
                      <span className="hint-row-level">{t("exercises.hints.rowLevel", { level: t(`exercises.hints.level.${hint.Level}`).toLowerCase() })}</span>
                    </>}
                  </button>
                  {open && <div className="hint-row-level-field">
                    <ExerciseFieldLabel labelKey="exercises.hints.levelShort" helpLines={levelHelpLines()} required />
                    <SelectMenu value={hint.Level} disabled={disabled} ariaLabel={t("exercises.hints.level")} className="w-44"
                      aria-invalid={Boolean(hintErrors?.Level)} aria-describedby={hintErrors?.Level ? levelErrorId : undefined}
                      options={levelOptions()}
                      onChange={(level) => apply((variants) => setHintLevel(variants, taskIndex, hintIndex, level as HintLevel))} />
                  </div>}
                  {!disabled && <span className="hint-row-actions">
                    <HoverTooltip text={t("exercises.hints.up")}>
                      <Button type="button" variant="ghost" size="icon" aria-label={t("exercises.hints.up")} disabled={hintIndex === 0} onClick={() => move(hintIndex, hintIndex - 1)}>
                        <ArrowUp aria-hidden="true" className="h-4 w-4" />
                      </Button>
                    </HoverTooltip>
                    <HoverTooltip text={t("exercises.hints.down")}>
                      <Button type="button" variant="ghost" size="icon" aria-label={t("exercises.hints.down")} disabled={hintIndex === hints.length - 1} onClick={() => move(hintIndex, hintIndex + 1)}>
                        <ArrowDown aria-hidden="true" className="h-4 w-4" />
                      </Button>
                    </HoverTooltip>
                    <RemoveAction ariaLabel={t("exercises.hints.remove")} onClick={() => remove(hintIndex)} />
                  </span>}
                </div>
                {open && <div id={panelId} className="hint-row-panel">
                  {hintErrors?.Level?.message && <p id={levelErrorId} role="alert" className="text-xs text-destructive">{hintErrors.Level.message}</p>}
                  <div className="space-y-1.5">
                    <HintTextEditor text={hint.Text} disabled={disabled} config={editor} invalid={Boolean(hintErrors?.Text)} describedBy={hintErrors?.Text ? `${base}-${hintIndex}-text-error` : undefined} ariaLabel={t("exercises.hints.textAria", { n: hintIndex + 1 })}
                      onChange={(text) => setValue(`${base}.${hintIndex}.Text`, text, { shouldDirty: true, shouldValidate: Boolean(hintErrors?.Text) })} />
                    {hintErrors?.Text?.message && <p id={`${base}-${hintIndex}-text-error`} role="alert" className="text-xs text-destructive">{hintErrors.Text.message}</p>}
                  </div>
                </div>}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
