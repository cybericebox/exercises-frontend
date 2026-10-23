"use client"

import { useState } from "react"
import { useFieldArray, useFormContext, useWatch } from "react-hook-form"
import { ArrowDown, ArrowUp, Ellipsis, Plus, Trash2 } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
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
  linked,
}: {
  variantIndex: number
  disabled: boolean
  /** A linked variant takes its subtasks from the base: no adding or removing here. */
  linked: boolean
}) {
  const { control, getValues, setValue } = useFormContext<DraftFormValues>()
  const name = `Variants.${variantIndex}.Tasks` as const
  const { fields, append, remove, move } = useFieldArray({ control, name })
  const [selected, setSelected] = useEditorPosition("task")
  const [pendingRemoval, setPendingRemoval] = useState<number | null>(null)
  const rows = useWatch({ control, name }) ?? []

  /**
   * The other variants, linked ones first. A base update fires the live mirror at once
   * (useLinkedVariantSync), so a linked variant must already have the change by then;
   * updating it after its base would apply the add or remove twice.
   */
  function otherVariantsLinkedFirst(): number[] {
    const others = getValues("Variants").flatMap((variant, index) => index === variantIndex ? [] : [{ index, linked: Boolean(variant.LinkedTo) }])
    return [...others.filter((item) => item.linked), ...others.filter((item) => !item.linked)].map((item) => item.index)
  }

  function addSharedTask() {
    const nextTask = emptyTask()
    otherVariantsLinkedFirst().forEach((index) => {
      const otherName = `Variants.${index}.Tasks` as const
      setValue(otherName, [...getValues(otherName), { ...nextTask }], { shouldDirty: true })
    })
    append(nextTask)
    setSelected(fields.length)
  }

  /** Moves a subtask in every variant: the order is one for all of them. */
  function moveSharedTask(from: number, to: number) {
    if (to < 0 || to >= fields.length) return
    const reorder = <T,>(list: T[]) => { const next = [...list]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next }
    otherVariantsLinkedFirst().forEach((index) => {
      const otherName = `Variants.${index}.Tasks` as const
      setValue(otherName, reorder(getValues(otherName)), { shouldDirty: true })
    })
    move(from, to)
    setSelected(to)
  }

  function removeSharedTask(taskIndex: number) {
    otherVariantsLinkedFirst().forEach((index) => {
      const otherName = `Variants.${index}.Tasks` as const
      setValue(otherName, getValues(otherName).filter((__, i) => i !== taskIndex), { shouldDirty: true })
    })
    remove(taskIndex)
    setSelected(0)
  }

  const activeIndex = Math.min(selected, Math.max(fields.length - 1, 0))

  const editable = !disabled && !linked
  const menu = editable ? <DropdownMenu>
    <HoverTooltip text={t("admin.exTask.actions")}>
      <DropdownMenuTrigger asChild><Button type="button" variant="outline" size="icon" aria-label={t("admin.exTask.actions")}><Ellipsis aria-hidden="true" className="h-4 w-4" /></Button></DropdownMenuTrigger>
    </HoverTooltip>
    <DropdownMenuContent align="end" className="w-64">
      <DropdownMenuItem className="gap-2" disabled={activeIndex === 0} onSelect={() => moveSharedTask(activeIndex, activeIndex - 1)}><ArrowUp aria-hidden="true" className="h-4 w-4" />{t("admin.exTask.moveUp")}</DropdownMenuItem>
      <DropdownMenuItem className="gap-2" disabled={activeIndex >= fields.length - 1} onSelect={() => moveSharedTask(activeIndex, activeIndex + 1)}><ArrowDown aria-hidden="true" className="h-4 w-4" />{t("admin.exTask.moveDown")}</DropdownMenuItem>
      {fields.length > 1 && <>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" onSelect={() => setPendingRemoval(activeIndex)}><Trash2 aria-hidden="true" className="h-4 w-4" />{t("admin.exTask.remove")}</DropdownMenuItem>
      </>}
      <p className="px-2 pb-1 pt-1.5 text-xs text-muted-foreground">{t("admin.exTask.actionsHint")}</p>
    </DropdownMenuContent>
  </DropdownMenu> : null

  return (
    <section className="subtasks">
      <nav aria-label={t("admin.exDraft.tasks.title")} className="subtasks-rail">
        <div className="subtasks-rail-head">
          <h3>{t("admin.exDraft.tasks.title")}</h3>
          {editable && <HoverTooltip text={t("admin.exTask.add")}>
            <Button type="button" variant="ghost" size="icon" aria-label={t("admin.exTask.add")} onClick={addSharedTask}>
              <Plus className="h-4 w-4" aria-hidden="true" />
            </Button>
          </HoverTooltip>}
        </div>
        <ol>
          {fields.map((field, ti) => (
            <li key={field.id} className="subtasks-item">
              <button type="button" aria-current={activeIndex === ti ? "page" : undefined} onClick={() => setSelected(ti)}>
                <span className="subtasks-num" aria-hidden="true">{ti + 1}</span>
                <span className="min-w-0 flex-1 truncate">{rows[ti]?.Name || t("admin.exTask.numbered", { n: ti + 1 })}</span>
              </button>
              {editable && fields.length > 1 && <RemoveAction ariaLabel={t("admin.exTask.remove")} className="subtasks-remove" onClick={() => setPendingRemoval(ti)} />}
            </li>
          ))}
        </ol>
      </nav>
      {fields[activeIndex] && <div key={fields[activeIndex].id} className="subtasks-pane">
        <TaskForm variantIndex={variantIndex} taskIndex={activeIndex} disabled={disabled} linked={linked} menu={menu} />
      </div>}
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
