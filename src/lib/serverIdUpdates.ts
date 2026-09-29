import type { Version } from "@/api/exercises/versions"
import type { DraftFormValues } from "@/lib/exerciseSchemas"

export type IdUpdate = {
  path: `Variants.${number}.ID` | `Variants.${number}.Tasks.${number}.ID`
  value: string
}

/** The variant/task ID sequence a form held at the moment a save request was sent ("" for new items). */
export type CapturedDraftIds = {
  variantIds: string[]
  taskIds: string[][]
}

/** Snapshot the current ID sequence right before sending — compare it against the LIVE form once the response lands. */
export function capturedDraftIds(form: DraftFormValues): CapturedDraftIds {
  return {
    variantIds: form.Variants.map((variant) => variant.ID),
    taskIds: form.Variants.map((variant) => variant.Tasks.map((task) => task.ID)),
  }
}

/**
 * IDs the backend assigned to variants/tasks that were "" when `sent` was captured.
 *
 * Adopted only while the CURRENT form's ID sequence still matches `sent` exactly — same
 * variant IDs in the same order, and for each variant the same task ID sequence. A same-count
 * delete+add during the in-flight save (e.g. task A deleted, task C added — count unchanged)
 * shifts which logical item sits at a given index without changing the count, so a positional
 * count-only guard would hand that index's server-assigned ID to the wrong item, or let a new
 * variant/task inherit a deleted one's ID (and its stored secrets). Comparing the full captured
 * ID sequence catches that: the shifted item's current ID no longer matches what was sent at
 * that position, so nothing is adopted — the next autosave sends the items again and the IDs
 * are adopted from that response instead. Existing (non-empty) IDs are never touched.
 */
export function serverIdUpdates(sent: CapturedDraftIds, saved: Version, form: DraftFormValues): IdUpdate[] {
  if (form.Variants.length !== sent.variantIds.length || form.Variants.length !== saved.Variants.length) return []
  if (form.Variants.some((variant, vi) => variant.ID !== sent.variantIds[vi])) return []
  if (form.Variants.some((variant, vi) =>
    variant.Tasks.length !== sent.taskIds[vi].length || variant.Tasks.length !== saved.Variants[vi].Tasks.length)) return []
  if (form.Variants.some((variant, vi) => variant.Tasks.some((task, ti) => task.ID !== sent.taskIds[vi][ti]))) return []

  const updates: IdUpdate[] = []
  form.Variants.forEach((variant, vi) => {
    const savedVariant = saved.Variants[vi]
    if (!variant.ID && savedVariant.ID) updates.push({ path: `Variants.${vi}.ID`, value: savedVariant.ID })
    variant.Tasks.forEach((task, ti) => {
      const id = savedVariant.Tasks[ti].ID
      if (!task.ID && id) updates.push({ path: `Variants.${vi}.Tasks.${ti}.ID`, value: id })
    })
  })
  return updates
}
