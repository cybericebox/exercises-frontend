"use client"

import { useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { ArrowDown, ArrowUp, ChevronDown, Plus } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { SelectMenu } from "@/components/ui/select-menu"
import RichTextEditor, { type LexicalState } from "@/components/editor/RichTextEditor"
import { HINT_LEVELS, type HintLevel } from "@/lib/hintLevels"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { addHint, canAddHint, moveHint, removeHint, setHintLevel } from "@/lib/hintSync"
import { hintPlainText, hintTextToState, stateToHintText } from "@/lib/hintText"
import { cn } from "@/utils/cn"
import { MAX_HINTS } from "@/lib/hintLimits"
import { GuideLink } from "./GuideLink"
import { ExerciseFieldLabel } from "./ExerciseFieldLabel"
import { ConfirmRemoveAction as RemoveAction } from "./ConfirmRemoveAction"

const levelOptions = () => HINT_LEVELS.map((level) => ({ value: level, label: t(`exercises.hints.level.${level}`) }))
const levelHelpLines = () => [
  t("exercises.hints.help"),
  t("exercises.hints.levelHelp.intro"),
  ...HINT_LEVELS.map((level) => t("exercises.hints.levelHelp.item", {
    level: t(`exercises.hints.level.${level}`),
    description: t(`exercises.hints.levelDescription.${level}`),
  })),
]

/**
 * The hint text as formatted text (the task description editor). Keeps the
 * last editor state so an edit without text (stored as "") does not reset it.
 */
function HintTextEditor({ text, onChange, disabled, invalid, ariaLabel, describedBy }: { text: string; onChange: (text: string) => void; disabled: boolean; invalid: boolean; ariaLabel: string; describedBy?: string }) {
  const [local, setLocal] = useState<{ text: string; state: LexicalState | null }>({ text: "", state: null })
  const value = local.text === text && local.state ? local.state : hintTextToState(text)
  return <RichTextEditor value={value} disabled={disabled} ariaLabel={ariaLabel} ariaDescribedBy={describedBy} invalid={invalid} contentHeight={144} allowAlignment={false}
    placeholder={t("exercises.hints.textPlaceholder")}
    onChange={(state) => {
      const next = stateToHintText(state)
      setLocal({ text: next, state })
      if (next !== text) onChange(next)
    }} />
}

/**
 * HintsEditor — a task's hints, as collapsed rows («1. text · рівень: натяк ⌄») that open to edit. Count, order and level are shared by every
 * variant (changes apply to all of them); the text is edited per variant tab.
 * The price of a hint is set on the event, not here. Level and text are
 * required: the level defaults to nudge (as a task's difficulty defaults to
 * easy); text is checked at publish. No alignment (short, left-aligned text).
 */
export function HintsEditor({ variantIndex, taskIndex, disabled }: { variantIndex: number; taskIndex: number; disabled: boolean }) {
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

  return (
    <section className="subtask-hints" aria-labelledby={`hints-${variantIndex}-${taskIndex}`}>
      <div className="subtask-section-title">
        <h4 id={`hints-${variantIndex}-${taskIndex}`}>{t("exercises.hints.title")}</h4>
        <span className="text-xs font-normal text-muted-foreground">{hints.length}/{MAX_HINTS}</span>
        <GuideLink topic="pidkazky" />
      </div>
      {listError && <p role="alert" className="text-xs text-destructive">{listError}</p>}
      {hints.length === 0 ? (
        <EmptyState compact message={t("exercises.hints.empty")} />
      ) : (
        <ol className="hint-list">
          {hints.map((hint, hintIndex) => {
            const hintErrors = Array.isArray(errors) ? errors[hintIndex] : undefined
            const open = expanded.has(hintIndex) || Boolean(hintErrors)
            const panelId = `${base}-${hintIndex}-panel`
            const words = hintPlainText(hint.Text)
            return (
              <li key={`${hint.ID || "new"}-${hintIndex}`} data-testid="hint-row" className={cn("hint-row group", open && "hint-row-open")}>
                <div className="hint-row-head">
                  <button type="button" className="hint-row-toggle" aria-expanded={open} aria-controls={panelId} onClick={() => toggle(hintIndex)}>
                    <span className="hint-row-text">{t("exercises.hints.row", { n: hintIndex + 1, text: words || t("exercises.hints.rowEmpty") })}</span>
                    <span className="hint-row-level">{t("exercises.hints.rowLevel", { level: t(`exercises.hints.level.${hint.Level}`).toLowerCase() })}</span>
                    <ChevronDown aria-hidden="true" className="hint-row-chevron h-4 w-4" />
                  </button>
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
                  <div className="flex flex-wrap items-center gap-2">
                    <ExerciseFieldLabel labelKey="exercises.hints.levelShort" helpLines={levelHelpLines()} required />
                    <SelectMenu value={hint.Level} disabled={disabled} ariaLabel={t("exercises.hints.level")} className="min-w-0 flex-1 sm:w-44 sm:flex-none"
                      aria-invalid={Boolean(hintErrors?.Level)} aria-describedby={hintErrors?.Level ? `${base}-${hintIndex}-level-error` : undefined}
                      options={levelOptions()}
                      onChange={(level) => apply((variants) => setHintLevel(variants, taskIndex, hintIndex, level as HintLevel))} />
                    {hintErrors?.Level?.message && <p id={`${base}-${hintIndex}-level-error`} role="alert" className="w-full text-xs text-destructive">{hintErrors.Level.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <HintTextEditor text={hint.Text} disabled={disabled} invalid={Boolean(hintErrors?.Text)} describedBy={hintErrors?.Text ? `${base}-${hintIndex}-text-error` : undefined} ariaLabel={t("exercises.hints.textAria", { n: hintIndex + 1 })}
                      onChange={(text) => setValue(`${base}.${hintIndex}.Text`, text, { shouldDirty: true, shouldValidate: Boolean(hintErrors?.Text) })} />
                    {hintErrors?.Text?.message && <p id={`${base}-${hintIndex}-text-error`} role="alert" className="text-xs text-destructive">{hintErrors.Text.message}</p>}
                  </div>
                </div>}
              </li>
            )
          })}
        </ol>
      )}
      {!disabled && (
        <Button type="button" variant="outline" size="sm" className="self-start" disabled={!canAddHint(hints)}
          onClick={() => { apply((variants) => addHint(variants, taskIndex)); setExpanded((current) => new Set([...current, hints.length])) }}>
          <Plus aria-hidden="true" className="mr-1 h-4 w-4" />{t("exercises.hints.add")}
        </Button>
      )}
    </section>
  )
}
