"use client"

import { useState } from "react"
import { useFieldArray, useFormContext, useWatch } from "react-hook-form"
import { Plus } from "lucide-react"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { emptyTask, type DraftFormValues } from "@/lib/exerciseSchemas"
import { TaskForm } from "./TaskForm"
import { RemoveAction } from "./RemoveAction"
import { useEditorPosition } from "./EditorPosition"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { HoverTooltip } from "@/components/ui/hover-tooltip"

/** TaskAccordion — a variant's stages: local navigation and one focused editor. */
export function TaskAccordion({
  variantIndex,
  disabled,
}: {
  variantIndex: number
  disabled: boolean
}) {
  const { control, getValues, setValue } = useFormContext<DraftFormValues>()
  const name = `Variants.${variantIndex}.Tasks` as const
  const { fields, append, remove } = useFieldArray({ control, name })
  const [selected, setSelected] = useEditorPosition("task")
  const [pendingRemoval, setPendingRemoval] = useState<number | null>(null)
  const rows = useWatch({ control, name }) ?? []

  function addSharedTask() {
    const nextTask = emptyTask()
    getValues("Variants").forEach((_, index) => {
      if (index === variantIndex) return
      const otherName = `Variants.${index}.Tasks` as const
      setValue(otherName, [...getValues(otherName), { ...nextTask }], { shouldDirty: true })
    })
    append(nextTask)
    setSelected(fields.length)
  }

  function removeSharedTask(taskIndex: number) {
    getValues("Variants").forEach((_, index) => {
      if (index === variantIndex) return
      const otherName = `Variants.${index}.Tasks` as const
      setValue(otherName, getValues(otherName).filter((__, i) => i !== taskIndex), { shouldDirty: true })
    })
    remove(taskIndex)
    setSelected(0)
  }

  const activeIndex = Math.min(selected, Math.max(fields.length - 1, 0))

  return (
    <section>
      <div className="exercise-settings-layout min-w-0 gap-4">
        <nav aria-label={t("admin.exDraft.tasks.title")} className="min-w-0 space-y-1 rounded-md border border-border p-2">
          <div className="mb-2 flex items-center justify-between border-b border-border px-2 pb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("admin.exDraft.tasks.title")}</h3>
            {!disabled && <HoverTooltip text={t("admin.exTask.add")}>
              <Button type="button" variant="ghost" size="icon" aria-label={t("admin.exTask.add")}
                className="h-7 w-7" onClick={addSharedTask}>
                <Plus className="h-4 w-4" aria-hidden="true" />
              </Button>
            </HoverTooltip>}
          </div>
          {fields.map((field, ti) => (
            <div key={field.id} className={`group flex min-w-0 items-center gap-1 rounded-md ${activeIndex === ti ? "bg-accent" : "hover:bg-muted"}`}>
              <button type="button" aria-current={activeIndex === ti ? "page" : undefined}
                onClick={() => setSelected(ti)}
                className={`min-w-0 flex-1 truncate rounded-md px-3 py-2 text-left text-sm ${activeIndex === ti ? "font-medium text-accent-foreground" : "text-muted-foreground"}`}>
                {rows[ti]?.Name || `${t("admin.exTask.untitled")} ${ti + 1}`}
              </button>
              {!disabled && fields.length > 1 && <RemoveAction ariaLabel={t("admin.exTask.remove")}
                className="mr-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                onClick={() => setPendingRemoval(ti)} />}
            </div>
          ))}
        </nav>
        {fields[activeIndex] && <div key={fields[activeIndex].id} className="min-w-0 rounded-md border border-border p-4 lg:min-h-[calc(100dvh-16rem)]">
          <TaskForm variantIndex={variantIndex} taskIndex={activeIndex} disabled={disabled} />
        </div>}
      </div>
      <ConfirmDialog open={pendingRemoval !== null} onCancel={() => setPendingRemoval(null)} tone="danger"
        title={t("admin.exTask.removeTitle")} description={t("admin.exTask.removeDescription")}
        cancelLabel={t("admin.exTask.removeCancel")} confirmLabel={t("admin.exTask.removeConfirm")}
        onConfirm={() => {
          if (pendingRemoval !== null) removeSharedTask(pendingRemoval)
          setPendingRemoval(null)
        }} />
    </section>
  )
}
