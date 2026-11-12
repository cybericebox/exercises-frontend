import type { UseFormReturn } from "react-hook-form"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { emptyCondition, type TaskFormValues } from "@/lib/editor/schemas/task"

type Form = UseFormReturn<DraftFormValues>

/**
 * The structure of the tasks is one for every variant: the order, the names, the difficulty, the number and level of hints,
 * the kind of check and «Відкривається після». These helpers write a value into the task at the same position of every
 * variant (linked variants first: a base update fires the live mirror at once, see useLinkedVariantSync).
 */
export function variantsLinkedFirst(form: Form, except: number | null = null): number[] {
  const others = form.getValues("Variants").flatMap((variant, index) => (index === except ? [] : [{ index, linked: Boolean(variant.LinkedTo) }]))
  return [...others.filter((item) => item.linked), ...others.filter((item) => !item.linked)].map((item) => item.index)
}

export function setSharedTaskValue(form: Form, taskIndex: number, subPath: string, value: unknown): void {
  for (const index of variantsLinkedFirst(form)) {
    form.setValue(`Variants.${index}.Tasks.${taskIndex}.${subPath}` as never, value as never, { shouldDirty: true })
  }
}

/** Changes the task at `taskIndex` of every variant with `change`. */
export function updateSharedTask(form: Form, taskIndex: number, change: (task: TaskFormValues, variantIndex: number) => TaskFormValues): void {
  for (const index of variantsLinkedFirst(form)) {
    const task = form.getValues(`Variants.${index}.Tasks.${taskIndex}`)
    if (task) form.setValue(`Variants.${index}.Tasks.${taskIndex}`, change(task, index), { shouldDirty: true })
  }
}

/** The first node device of a variant (the default device of a new condition), or "". */
export function firstNodeDeviceId(form: Form, variantIndex: number): string {
  return form.getValues(`Variants.${variantIndex}.Topology.Devices`)?.find((device) => device.Type === "node")?.ID ?? ""
}

export type CheckChoice = "flag" | "text" | "state"

export function checkChoiceOf(task: Pick<TaskFormValues, "Check">): CheckChoice {
  return task.Check.Kind === "state" ? "state" : task.Check.Answer.Type
}

/** Switches the kind of check of a task in every variant; both halves stay in the form, so nothing typed is lost. */
export function setCheckChoice(form: Form, taskIndex: number, choice: CheckChoice): void {
  updateSharedTask(form, taskIndex, (task, variantIndex) => {
    if (choice === "state") {
      const conditions = task.Check.State.Conditions
      return { ...task, Check: { ...task.Check, Kind: "state", State: conditions.length ? task.Check.State : { ...task.Check.State, Conditions: [emptyCondition("file", firstNodeDeviceId(form, variantIndex))] } } }
    }
    return { ...task, Check: { ...task.Check, Kind: "answer", Answer: { ...task.Check.Answer, Type: choice } } }
  })
}

/** Tasks the task at `index` may open after: not itself, and none that already (directly or not) waits for it. */
export function eligibleRequires(tasks: Pick<TaskFormValues, "Key" | "Requires">[], index: number): number[] {
  const self = tasks[index]?.Key
  const byKey = new Map(tasks.map((task) => [task.Key, task]))
  const waitsFor = (key: string, target: string, seen = new Set<string>()): boolean => {
    if (key === target) return true
    if (seen.has(key)) return false
    seen.add(key)
    return (byKey.get(key)?.Requires ?? []).some((next) => waitsFor(next, target, seen))
  }
  return tasks.flatMap((task, position) => (position === index || task.Key === "" || (self && waitsFor(task.Key, self)) ? [] : [position]))
}

/** A help line goes after «term — », so its first letter is lower case. */
export const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1)
