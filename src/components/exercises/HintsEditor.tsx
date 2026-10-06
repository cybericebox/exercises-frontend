"use client"

import { useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { ArrowDown, ArrowUp, Plus } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { SelectMenu } from "@/components/ui/select-menu"
import RichTextEditor, { type LexicalState } from "@/components/editor/RichTextEditor"
import { HINT_LEVELS, type HintLevel } from "@/lib/hintLevels"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { addHint, canAddHint, moveHint, removeHint, setHintLevel } from "@/lib/hintSync"
import { hintTextToState, stateToHintText } from "@/lib/hintText"
import { MAX_HINTS } from "@/lib/hintLimits"
import { ExerciseFieldLabel } from "./ExerciseFieldLabel"
import { RemoveAction } from "./RemoveAction"

const levelOptions = () => HINT_LEVELS.map((level) => ({ value: level, label: t(`exercises.hints.level.${level}`) }))
const levelHelpLines = () => [
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
function HintTextEditor({ text, onChange, disabled, invalid, ariaLabel }: { text: string; onChange: (text: string) => void; disabled: boolean; invalid: boolean; ariaLabel: string }) {
  const [local, setLocal] = useState<{ text: string; state: LexicalState | null }>({ text: "", state: null })
  const value = local.text === text && local.state ? local.state : hintTextToState(text)
  return <RichTextEditor value={value} disabled={disabled} ariaLabel={ariaLabel} invalid={invalid} minHeightClassName="min-h-[4.5rem]" allowAlignment={false}
    placeholder={t("exercises.hints.textPlaceholder")}
    onChange={(state) => {
      const next = stateToHintText(state)
      setLocal({ text: next, state })
      if (next !== text) onChange(next)
    }} />
}

/**
 * HintsEditor — a task's hints. Count, order and level are shared by every
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

  function apply(change: (variants: DraftFormValues["Variants"]) => DraftFormValues["Variants"]) {
    const next = change(getValues("Variants"))
    next.forEach((variant, index) => {
      setValue(`Variants.${index}.Tasks.${taskIndex}.Hints`, variant.Tasks[taskIndex]?.Hints ?? [], { shouldDirty: true })
    })
  }

  const listError = errors && !Array.isArray(errors) ? (errors as { message?: string }).message : undefined

  return (
    <section className="space-y-3 border-t border-border pt-3" aria-labelledby={`hints-${variantIndex}-${taskIndex}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h4 id={`hints-${variantIndex}-${taskIndex}`} className="text-sm font-semibold text-foreground">
            {t("exercises.hints.title")}
          </h4>
          <span className="text-xs text-muted-foreground">{hints.length}/{MAX_HINTS}</span>
        </div>
        {!disabled && (
          <Button type="button" variant="outline" size="sm" disabled={!canAddHint(hints)}
            onClick={() => apply((variants) => addHint(variants, taskIndex))}>
            <Plus aria-hidden="true" className="mr-1 h-4 w-4" />{t("exercises.hints.add")}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t("exercises.hints.help")}</p>
      {listError && <p role="alert" className="text-xs text-destructive">{listError}</p>}
      {hints.length === 0 ? (
        <EmptyState compact message={t("exercises.hints.empty")} />
      ) : (
        <ol className="space-y-3">
          {hints.map((hint, hintIndex) => {
            const hintErrors = Array.isArray(errors) ? errors[hintIndex] : undefined
            const title = t("exercises.hints.item", { n: hintIndex + 1 })
            return (
              <li key={`${hint.ID || "new"}-${hintIndex}`} data-testid="hint-row" className="space-y-3 rounded-md border border-border p-3">
                {/* One header row: title left; level (label + select inline) and the row actions right.
                    Narrow screens: the level group wraps to its own full-width line. */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="text-sm font-medium leading-5 text-foreground">{title}</span>
                  <div className="order-last flex w-full items-center gap-2 sm:order-none sm:ml-auto sm:w-auto">
                    <ExerciseFieldLabel labelKey="exercises.hints.levelShort" helpLines={levelHelpLines()} required />
                    <SelectMenu value={hint.Level} disabled={disabled} ariaLabel={t("exercises.hints.level")} className="h-8 min-w-0 flex-1 sm:w-44 sm:flex-none"
                      options={levelOptions()}
                      onChange={(level) => apply((variants) => setHintLevel(variants, taskIndex, hintIndex, level as HintLevel))} />
                  </div>
                  {!disabled && (
                    <span className="ml-auto flex items-center gap-1 sm:ml-0">
                      <HoverTooltip text={t("exercises.hints.up")}>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={t("exercises.hints.up")}
                          disabled={hintIndex === 0} onClick={() => apply((variants) => moveHint(variants, taskIndex, hintIndex, hintIndex - 1))}>
                          <ArrowUp aria-hidden="true" className="h-4 w-4" />
                        </Button>
                      </HoverTooltip>
                      <HoverTooltip text={t("exercises.hints.down")}>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={t("exercises.hints.down")}
                          disabled={hintIndex === hints.length - 1} onClick={() => apply((variants) => moveHint(variants, taskIndex, hintIndex, hintIndex + 1))}>
                          <ArrowDown aria-hidden="true" className="h-4 w-4" />
                        </Button>
                      </HoverTooltip>
                      <RemoveAction ariaLabel={t("exercises.hints.remove")} onClick={() => apply((variants) => removeHint(variants, taskIndex, hintIndex))} />
                    </span>
                  )}
                </div>
                {hintErrors?.Level?.message && <p role="alert" className="text-xs text-destructive">{hintErrors.Level.message}</p>}
                <div className="space-y-1.5">
                  <HintTextEditor text={hint.Text} disabled={disabled} invalid={Boolean(hintErrors?.Text)} ariaLabel={t("exercises.hints.textAria", { n: hintIndex + 1 })}
                    onChange={(text) => setValue(`${base}.${hintIndex}.Text`, text, { shouldDirty: true, shouldValidate: Boolean(hintErrors?.Text) })} />
                  {hintErrors?.Text?.message && <p role="alert" className="text-xs text-destructive">{hintErrors.Text.message}</p>}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
