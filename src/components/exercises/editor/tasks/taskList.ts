"use client"

import { useFieldArray, useFormContext, useWatch } from "react-hook-form"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { emptyTask, nextTaskKey, type TaskFormValues } from "@/lib/editor/schemas/task"
import { variantsLinkedFirst } from "./taskShared"

/** The tasks of the current variant and the operations that apply to every variant (add, move, remove). */
export function useTaskList(variantIndex: number) {
  const form = useFormContext<DraftFormValues>()
  const { control, getValues, setValue } = form
  const name = `Variants.${variantIndex}.Tasks` as const
  const { fields, append, remove, move } = useFieldArray({ control, name })
  const rows = useWatch({ control, name }) ?? []

  const others = () => variantsLinkedFirst(form, variantIndex)

  function add(): number {
    const task = emptyTask(nextTaskKey(getValues(name)))
    others().forEach((index) => setValue(`Variants.${index}.Tasks`, [...getValues(`Variants.${index}.Tasks`), { ...task }], { shouldDirty: true }))
    append(task)
    return fields.length
  }

  function moveTo(from: number, to: number): void {
    if (to < 0 || to >= fields.length) return
    const reorder = (list: TaskFormValues[]) => { const next = [...list]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next }
    others().forEach((index) => setValue(`Variants.${index}.Tasks`, reorder(getValues(`Variants.${index}.Tasks`)), { shouldDirty: true }))
    move(from, to)
  }

  /** Removes the task from every variant and drops it from «Відкривається після» of the others. */
  function removeAt(taskIndex: number): void {
    const key = getValues(`${name}.${taskIndex}.Key`)
    others().forEach((index) => {
      const next = getValues(`Variants.${index}.Tasks`).filter((_, position) => position !== taskIndex)
      setValue(`Variants.${index}.Tasks`, next.map((task) => (task.Requires.includes(key) ? { ...task, Requires: task.Requires.filter((required) => required !== key) } : task)), { shouldDirty: true })
    })
    remove(taskIndex)
    const own = getValues(name)
    if (own.some((task) => task.Requires.includes(key))) setValue(name, own.map((task) => ({ ...task, Requires: task.Requires.filter((required) => required !== key) })), { shouldDirty: true })
  }

  /** Names of the tasks that open after the task at `taskIndex`. */
  function dependentsOf(taskIndex: number): string[] {
    const key = rows[taskIndex]?.Key
    if (!key) return []
    return rows.filter((task) => task.Requires.includes(key)).map((task) => task.Name)
  }

  return { fields, rows, add, moveTo, removeAt, dependentsOf }
}
