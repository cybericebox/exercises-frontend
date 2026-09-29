"use client"

import { useFormContext, useWatch } from "react-hook-form"
import { ArrowDown, ArrowUp, Plus } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { addHint, canAddHint, moveHint, removeHint, setHintCost } from "@/lib/hintSync"
import { MAX_HINTS, MAX_HINT_COST, MAX_HINT_TEXT } from "@/lib/hintLimits"
import { ExerciseFieldLabel } from "./ExerciseFieldLabel"
import { RemoveAction } from "./RemoveAction"

/**
 * HintsEditor — a task's hints. Count, order and cost are shared by every
 * variant (changes apply to all of them); the text is edited per variant tab.
 */
export function HintsEditor({ variantIndex, taskIndex, disabled }: { variantIndex: number; taskIndex: number; disabled: boolean }) {
  const { control, getValues, setValue, register, formState } = useFormContext<DraftFormValues>()
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
          <h4 id={`hints-${variantIndex}-${taskIndex}`} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
            const textId = `hint-text-${variantIndex}-${taskIndex}-${hintIndex}`
            const costId = `hint-cost-${variantIndex}-${taskIndex}-${hintIndex}`
            return (
              <li key={`${hint.ID || "new"}-${hintIndex}`} data-testid="hint-row" className="rounded-md border border-border p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{t("exercises.hints.item").replace("{n}", String(hintIndex + 1))}</span>
                  {!disabled && (
                    <span className="flex items-center gap-1">
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
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-64 flex-1 space-y-1">
                    <label htmlFor={textId} className="text-xs text-muted-foreground">{t("exercises.hints.text")}</label>
                    <Textarea id={textId} rows={2} maxLength={MAX_HINT_TEXT} disabled={disabled} aria-invalid={Boolean(hintErrors?.Text)}
                      placeholder={t("exercises.hints.textPlaceholder")} {...register(`${base}.${hintIndex}.Text`)} />
                    {hintErrors?.Text?.message && <p role="alert" className="text-xs text-destructive">{hintErrors.Text.message}</p>}
                  </div>
                  <div className="w-40 space-y-1">
                    <ExerciseFieldLabel labelKey="exercises.hints.cost" helpKey="exercises.hints.costHelp" htmlFor={costId} />
                    <Input id={costId} type="number" inputMode="numeric" min={0} max={MAX_HINT_COST} step={1} disabled={disabled}
                      aria-invalid={Boolean(hintErrors?.Cost)} value={hint.Cost}
                      onChange={(event) => apply((variants) => setHintCost(variants, taskIndex, hintIndex, Number(event.target.value)))} />
                    <p className="text-xs text-muted-foreground">{hint.Cost === 0 ? t("exercises.hints.free") : t("exercises.hints.points")}</p>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
