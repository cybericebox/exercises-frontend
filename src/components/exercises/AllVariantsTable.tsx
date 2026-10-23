"use client"

import { useId, useMemo, useState, type ReactNode } from "react"
import { useFormState, useWatch, type UseFormReturn } from "react-hook-form"
import { Layers, Paperclip, TriangleAlert } from "lucide-react"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { FieldHelp } from "@/components/ui/field-help"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { MAX_VARIANT_WEIGHT, MIN_VARIANT_WEIGHT, isValidWeight, type DraftFormValues } from "@/lib/exerciseSchemas"
import { planSimplify } from "@/lib/simplifyVariants"
import { issueOrder } from "@/lib/variantWeights"
import { SimplifyVariantsDialog } from "./SimplifyVariantsDialog"
import { cn } from "@/utils/cn"

const TEMPLATE_PREFIX = "template:"

/** Errors of a variant's weight and subtask flags (the form's own validation), by position. */
type FlagErrors = { Variants?: { Weight?: { message?: string }; Tasks?: { Flag?: unknown }[] }[] }

/** How many issues the order line shows. */
const ORDER_PREVIEW = 14

/**
 * A variant's issue weight. The typed text is local: only a whole number in range reaches the form, so the
 * autosave never sends a half-typed value; an invalid one shows its error beside the field and keeps the last valid weight.
 */
function WeightInput({ form, index, value, disabled, formError }: { form: UseFormReturn<DraftFormValues>; index: number; value: number; disabled: boolean; formError?: string }) {
  const errorId = useId()
  const [text, setText] = useState(String(value))
  const [shown, setShown] = useState(value)
  // The form changed it (simplify, a reload): show the new value.
  if (shown !== value) {
    setShown(value)
    if (Number(text) !== value) setText(String(value))
  }
  const typed = text.trim() === "" ? NaN : Number(text)
  const error = isValidWeight(typed) ? formError : t("admin.ex.val.weight", { max: MAX_VARIANT_WEIGHT })
  return <div className="all-variants-weight">
    <input type="number" inputMode="numeric" min={MIN_VARIANT_WEIGHT} max={MAX_VARIANT_WEIGHT} step={1} className="all-variants-weight-input"
      aria-label={t("admin.exDraft.weightCell", { n: index + 1 })} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}
      disabled={disabled} value={text} onChange={(event) => {
        setText(event.target.value)
        const next = event.target.value.trim() === "" ? NaN : Number(event.target.value)
        if (isValidWeight(next) && next !== value) {
          setShown(next)
          form.setValue(`Variants.${index}.Weight`, next, { shouldDirty: true, shouldValidate: Boolean(formError) })
        }
      }} />
    {error && <p id={errorId} className="all-variants-weight-error">{error}</p>}
  </div>
}

/**
 * Every variant in one table: what makes each one different at a glance — the first flag of every subtask
 * (edited in place), its files, the infrastructure (own or the base's) and the note. A number opens the variant.
 */
export function AllVariantsTable({ form, disabled, onOpen, actions }: { form: UseFormReturn<DraftFormValues>; disabled: boolean; onOpen: (index: number) => void; actions?: ReactNode }) {
  const watched = useWatch({ control: form.control, name: "Variants" })
  const variants = useMemo(() => watched ?? [], [watched])
  const { errors } = useFormState({ control: form.control, name: "Variants" })
  const subtasks = variants[0]?.Tasks ?? []
  const baseIndex = (linkedTo: string) => linkedTo ? variants.findIndex((variant) => variant.ID !== "" && variant.ID === linkedTo) : -1
  const order = issueOrder(variants.map((variant) => variant.Weight), ORDER_PREVIEW)
  const plan = useMemo(() => planSimplify(variants), [variants])
  const [simplifyOpen, setSimplifyOpen] = useState(false)
  return <div className="all-variants">
    <div className="all-variants-toolbar">
      <h3 className="all-variants-title">{t("admin.exDraft.allVariants")}<span className="all-variants-count">{variants.length}</span></h3>
      <HoverTooltip text={t("admin.exDraft.issueOrderRule")}>
        <p className="all-variants-order" tabIndex={0}>{t("admin.exDraft.issueOrder", { order: order.join(" ") })}</p>
      </HoverTooltip>
      <div className="all-variants-actions">
      {!disabled && plan && plan.count > 0 && <HoverTooltip text={t("admin.exSimplify.openHint")}>
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setSimplifyOpen(true)}>
          <Layers aria-hidden="true" className="h-4 w-4" />{t("admin.exSimplify.open", { count: plan.count })}
        </Button>
      </HoverTooltip>}
      {actions}
      </div>
    </div>
    {!disabled && plan && plan.count > 0 && <div className="all-variants-strip" role="status">
      <TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
      <p>{plan.merges.length > 0 ? t("admin.exSimplify.stripMerge", { before: variants.length, after: plan.variants.length }) : t("admin.exSimplify.stripLink")}</p>
      <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={() => setSimplifyOpen(true)}>{t("admin.exSimplify.review")}</Button>
    </div>}
    {simplifyOpen && plan && <SimplifyVariantsDialog plan={plan} before={variants.length} onClose={() => setSimplifyOpen(false)} onApply={() => {
      // At once in the form; the autosave queue saves it.
      form.setValue("Variants", plan.variants, { shouldDirty: true })
      setSimplifyOpen(false)
    }} />}
    <div className="all-variants-scroll" role="region" aria-label={t("admin.exDraft.allVariants")} tabIndex={0}>
      <table className="all-variants-table">
        <thead><tr>
          <th scope="col" className="all-variants-sticky">{t("admin.exDraft.variant")}</th>
          <th scope="col"><span className="all-variants-label">{t("admin.exDraft.weight")}<FieldHelp text={t("admin.exDraft.weightHelp")} /></span></th>
          {subtasks.map((task, index) => <th key={task.ID || index} scope="col">
            <span className="all-variants-subtask">{t("admin.exDraft.subtaskColumn", { n: index + 1, name: task.Name || t("admin.exTask.numbered", { n: index + 1 }) })}</span>
            <span className="text-muted-foreground"> · {t(`admin.ex.difficulty.${task.Difficulty}`).toLowerCase()}</span>
          </th>)}
          <th scope="col">{t("admin.exDraft.tab.topology")}</th>
          <th scope="col">{t("admin.exDraft.tab.note")}</th>
        </tr></thead>
        <tbody>{variants.map((variant, vi) => {
          const base = baseIndex(variant.LinkedTo)
          return <tr key={variant.ID || `new-${vi}`} className={cn(vi === 0 && "all-variants-first")}>
            <th scope="row" className="all-variants-sticky">
              <button type="button" className="all-variants-open" aria-label={t("admin.exDraft.openVariant", { n: vi + 1 })} onClick={() => onOpen(vi)}>{vi + 1}</button>
              {base >= 0 && <HoverTooltip text={t("admin.exDraft.variantBasedOn", { n: vi + 1, base: base + 1 })}><span className="all-variants-base">← {base + 1}</span></HoverTooltip>}
            </th>
            <td><WeightInput form={form} index={vi} value={variant.Weight} disabled={disabled} formError={(errors as FlagErrors).Variants?.[vi]?.Weight?.message} /></td>
            {subtasks.map((_, si) => {
              const task = variant.Tasks[si]
              if (!task) return <td key={si}>—</td>
              const flags = task.Flag ?? []
              const first = flags[0] ?? ""
              const template = first.startsWith(TEMPLATE_PREFIX)
              const invalid = Boolean((errors as FlagErrors).Variants?.[vi]?.Tasks?.[si]?.Flag)
              const label = t("admin.exDraft.flagCell", { n: vi + 1, task: si + 1 })
              return <td key={si}><div className="all-variants-cell">
                {template
                  ? <HoverTooltip text={first.slice(TEMPLATE_PREFIX.length)}><span className="all-variants-template" tabIndex={0}>{t("admin.exTask.flag.modeTemplate")}</span></HoverTooltip>
                  : <input className="all-variants-flag" aria-label={label} aria-invalid={invalid || undefined} disabled={disabled} placeholder={t("admin.exDraft.flagRandom")}
                    value={first} onChange={(event) => {
                      const next = [event.target.value, ...flags.slice(1)]
                      // An empty only flag means «random on deployment», like in the subtask form.
                      form.setValue(`Variants.${vi}.Tasks.${si}.Flag`, next.length === 1 && next[0] === "" ? [] : next, { shouldDirty: true, shouldValidate: invalid })
                    }} />}
                {flags.length > 1 && <HoverTooltip text={flags.map((flag) => flag.replace(TEMPLATE_PREFIX, "")).join("\n")}><span className="all-variants-more" tabIndex={0}>+{flags.length - 1}</span></HoverTooltip>}
                {task.Attachments.length > 0 && <HoverTooltip text={task.Attachments.map((file) => file.Name).join(", ")}><span className="all-variants-files" tabIndex={0} aria-label={t("admin.exDraft.filesCount", { count: task.Attachments.length })}><Paperclip aria-hidden="true" className="h-3.5 w-3.5" />{task.Attachments.length}</span></HoverTooltip>}
              </div></td>
            })}
            <td className="text-muted-foreground">{base >= 0 ? t("admin.exDraft.infraAsIn", { n: base + 1 }) : vi === 0 ? t("admin.exDraft.infraMain") : t("admin.exDraft.infraOwn")}</td>
            <td className="all-variants-note">{variant.Note && <HoverTooltip text={variant.Note} truncated><span className="all-variants-note-text" tabIndex={0}>{variant.Note}</span></HoverTooltip>}</td>
          </tr>
        })}</tbody>
      </table>
    </div>
  </div>
}
