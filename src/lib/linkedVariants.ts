/**
 * linkedVariants.ts — pure rules for linked variants. Mirrors the backend
 * (exerciseModel.SyncLinkedVariants / validateLinkedFlags); the server stays authoritative.
 * Nothing here mutates its input.
 */
import type { VariantFormValues } from "@/lib/exerciseSchemas"
import { TEMPLATE_PREFIX } from "@/lib/flagPattern"

type OwnTask = { Flag: string[]; Attachments: { FileID: string; Name: string }[] }

function clone<T>(value: T): T {
  return structuredClone(value)
}

/** Backend matchLinkedTask: by task id when the base id is set, else by position. */
function matchOwnTask(tasks: VariantFormValues["Tasks"], baseId: string, position: number) {
  if (baseId) {
    const byId = tasks.find((task) => task.ID === baseId)
    if (byId) return byId
  }
  if (position < tasks.length && (!baseId || !tasks[position].ID)) return tasks[position]
  return undefined
}

function inheritFrom(base: VariantFormValues, own: { ID: string; Index: number; Note: string; LinkedTo: string; CopyOf?: string; Tasks: VariantFormValues["Tasks"] }): VariantFormValues {
  const rebuilt = clone(base)
  rebuilt.Tasks.forEach((task, position) => {
    const mine = matchOwnTask(own.Tasks, task.ID, position)
    task.Flag = mine ? clone(mine.Flag) : []
    task.Attachments = mine ? clone(mine.Attachments) : []
  })
  rebuilt.ID = own.ID
  rebuilt.Index = own.Index
  rebuilt.Note = own.Note
  rebuilt.LinkedTo = own.LinkedTo
  if (own.CopyOf) rebuilt.CopyOf = own.CopyOf
  else delete rebuilt.CopyOf
  return rebuilt
}

/**
 * Rebuilds every linked variant from its base. Like the backend, it first unlinks every variant
 * whose base is missing, then checks self/chain links and rebuilds against that resolved list.
 */
export function syncLinkedVariants(variants: VariantFormValues[]): VariantFormValues[] {
  const findBase = (id: string) => variants.find((v) => v.ID !== "" && v.ID === id)
  const resolved = variants.map((variant) => (variant.LinkedTo && !findBase(variant.LinkedTo) ? { ...variant, LinkedTo: "" } : variant))
  const resolvedBase = (id: string) => resolved.find((v) => v.ID !== "" && v.ID === id)
  return resolved.map((variant, index) => {
    if (!variant.LinkedTo) return variant
    const base = resolvedBase(variant.LinkedTo)
    if (!base || resolved.indexOf(base) === index || base.LinkedTo) return variant
    return inheritFrom(base, variant)
  })
}

/** Deep, unlinked copy of a variant; CopyOf remembers the stored source. */
export function copyVariant(source: VariantFormValues, index: number): VariantFormValues {
  const copy = clone(source)
  copy.ID = ""
  copy.Index = index
  copy.LinkedTo = ""
  if (source.ID) copy.CopyOf = source.ID
  else delete copy.CopyOf
  return copy
}

/** A new variant linked to the base, with only its own flags, files and note. */
export function newLinkedVariant(base: VariantFormValues, index: number, own: { Note: string; Tasks: OwnTask[] }): VariantFormValues {
  const created = clone(base)
  created.ID = ""
  created.Index = index
  created.Note = own.Note
  created.LinkedTo = base.ID
  delete created.CopyOf
  created.Tasks.forEach((task, position) => {
    task.Flag = clone(own.Tasks[position]?.Flag ?? [])
    task.Attachments = clone(own.Tasks[position]?.Attachments ?? [])
  })
  return created
}

/** Indexes of variants a new link may point to: saved and not linked themselves. */
export function baseCandidates(variants: VariantFormValues[]): number[] {
  return variants.flatMap((variant, index) => (variant.ID && !variant.LinkedTo ? [index] : []))
}

/** Indexes of the variants linked to the given base id. */
export function dependentsOf(variants: VariantFormValues[], baseId: string): number[] {
  if (!baseId) return []
  return variants.flatMap((variant, index) => (variant.LinkedTo === baseId ? [index] : []))
}

/**
 * Duplicate fixed flags inside a group (a base plus its linked variants), compared per task
 * position. Templates and empty values are skipped; every occurrence after the first is reported.
 */
export function linkedFlagConflicts(variants: VariantFormValues[]): { variantIndex: number; taskIndex: number }[] {
  const conflicts: { variantIndex: number; taskIndex: number }[] = []
  variants.forEach((base, baseIndex) => {
    if (base.LinkedTo || !base.ID) return
    const group = [baseIndex, ...dependentsOf(variants, base.ID)]
    if (group.length < 2) return
    base.Tasks.forEach((_, taskIndex) => {
      const owner = new Map<string, number>()
      const reported = new Set<number>()
      for (const variantIndex of group) {
        const flags = variants[variantIndex].Tasks[taskIndex]?.Flag ?? []
        for (const value of flags) {
          if (!value || value.startsWith(TEMPLATE_PREFIX)) continue
          const previous = owner.get(value)
          if (previous !== undefined && previous !== variantIndex && !reported.has(variantIndex)) {
            reported.add(variantIndex)
            conflicts.push({ variantIndex, taskIndex })
          }
          owner.set(value, variantIndex)
        }
      }
    })
  })
  return conflicts.sort((a, b) => a.variantIndex - b.variantIndex || a.taskIndex - b.taskIndex)
}
