"use client"

import { useFormState, useWatch, type UseFormReturn } from "react-hook-form"
import { Paperclip } from "lucide-react"
import { t } from "@/i18n/t"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { cn } from "@/utils/cn"

const TEMPLATE_PREFIX = "template:"

/** Errors of a variant's subtask flags (the form's own validation), by position. */
type FlagErrors = { Variants?: { Tasks?: { Flag?: unknown }[] }[] }

/**
 * Every variant in one table: what makes each one different at a glance — the first flag of every subtask
 * (edited in place), its files, the infrastructure (own or the base's) and the note. A number opens the variant.
 */
export function AllVariantsTable({ form, disabled, onOpen }: { form: UseFormReturn<DraftFormValues>; disabled: boolean; onOpen: (index: number) => void }) {
  const variants = useWatch({ control: form.control, name: "Variants" }) ?? []
  const { errors } = useFormState({ control: form.control, name: "Variants" })
  const subtasks = variants[0]?.Tasks ?? []
  const baseIndex = (linkedTo: string) => linkedTo ? variants.findIndex((variant) => variant.ID !== "" && variant.ID === linkedTo) : -1
  return <div className="all-variants">
    <div className="all-variants-scroll" role="region" aria-label={t("admin.exDraft.allVariants")} tabIndex={0}>
      <table className="all-variants-table">
        <thead><tr>
          <th scope="col" className="all-variants-sticky">{t("admin.exDraft.variant")}</th>
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
            <td className="all-variants-note">{variant.Note && <HoverTooltip text={variant.Note} truncated><span className="block truncate">{variant.Note}</span></HoverTooltip>}</td>
          </tr>
        })}</tbody>
      </table>
    </div>
  </div>
}
