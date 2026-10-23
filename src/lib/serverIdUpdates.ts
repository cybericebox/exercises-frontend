import type { Version } from "@/api/exercises/versions"
import type { DraftFormValues } from "@/lib/exerciseSchemas"

export type IdUpdate = {
  path: `Variants.${number}.ID` | `Variants.${number}.Tasks.${number}.ID` | `Variants.${number}.Tasks.${number}.Hints.${number}.ID`
  value: string
}

/** The variant/task ID sequence a form held at the moment a save request was sent ("" for new items). */
export type CapturedDraftIds = {
  variantIds: string[]
  taskIds: string[][]
  /** Hint IDs per variant/task: server-assigned hint IDs must be kept (event hint cost overrides key on them). */
  hintIds: string[][][]
  /** Secret values typed in the editor and sent with this save (by variant position, device id and variable name). */
  secrets: { variant: number; deviceId: string; name: string; value: string }[]
}

/** Snapshot the current ID sequence right before sending — compare it against the LIVE form once the response lands. */
export function capturedDraftIds(form: DraftFormValues): CapturedDraftIds {
  return {
    variantIds: form.Variants.map((variant) => variant.ID),
    taskIds: form.Variants.map((variant) => variant.Tasks.map((task) => task.ID)),
    hintIds: form.Variants.map((variant) => variant.Tasks.map((task) => (task.Hints ?? []).map((hint) => hint.ID))),
    secrets: form.Variants.flatMap((variant, vi) => variant.Topology.Devices.flatMap((device) => device.EnvVars
      .filter((env) => env.Secret && env.Value !== "")
      .map((env) => ({ variant: vi, deviceId: device.ID, name: env.Name, value: env.Value })))),
  }
}

export type SecretUpdate =
  | { path: `Variants.${number}.Topology.Devices.${number}.EnvVars.${number}.Value`; value: string }
  | { path: `Variants.${number}.Topology.Devices.${number}.EnvVars.${number}.HasValue`; value: boolean }
  | { path: `Variants.${number}.Topology.Devices.${number}.EnvVars.${number}.ValueGroup`; value: number | undefined }

/**
 * After an acknowledged save the secrets take their state from the server's answer:
 *  - a secret typed in the editor and sent becomes a stored one (its typed Value is cleared — an empty Value on save
 *    keeps the stored one — and HasValue is set), only while the live form still holds exactly the value that was sent;
 *  - every secret re-reads its ValueGroup from this answer. Groups mean something only within one response, so all
 *    groups in the form must come from the same one; a secret the answer does not describe (or one typed further)
 *    loses its group and is not comparable.
 * Under the same variant sequence guard as the ids (otherwise nothing changes and the groups stay those of the previous
 * answer, still consistent among themselves). Leaf paths only: nothing is remounted.
 */
export function savedSecretUpdates(sent: CapturedDraftIds, saved: Version, form: DraftFormValues): SecretUpdate[] {
  if (form.Variants.length !== sent.variantIds.length || form.Variants.length !== saved.Variants.length) return []
  if (form.Variants.some((variant, vi) => variant.ID !== sent.variantIds[vi])) return []
  const updates: SecretUpdate[] = []
  form.Variants.forEach((variant, vi) => variant.Topology.Devices.forEach((device, di) => device.EnvVars.forEach((live, ei) => {
    if (!live.Secret) return
    const base = `Variants.${vi}.Topology.Devices.${di}.EnvVars.${ei}` as const
    const stored = saved.Variants[vi].Topology.Devices.find((candidate) => candidate.ID === device.ID)?.EnvVars.find((env) => env.Name === live.Name)
    const sentValue = sent.secrets.find((secret) => secret.variant === vi && secret.deviceId === device.ID && secret.name === live.Name)?.value
    let group = stored?.Secret && stored.HasValue ? stored.ValueGroup : undefined
    if (live.Value !== "") {
      if (sentValue === undefined || live.Value !== sentValue || !stored?.Secret || !stored.HasValue) group = undefined
      else updates.push({ path: `${base}.Value`, value: "" }, { path: `${base}.HasValue`, value: true })
    }
    if (group !== live.ValueGroup) updates.push({ path: `${base}.ValueGroup`, value: group })
  })))
  return updates
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
 *
 * Linked variants come first: writing a base id fires the live mirror (useLinkedVariantSync),
 * and a linked variant that already holds the same ids (the daemon deep-copies the base) has
 * nothing to change, so its open subtask form is not remounted.
 */
export function serverIdUpdates(sent: CapturedDraftIds, saved: Version, form: DraftFormValues): IdUpdate[] {
  if (form.Variants.length !== sent.variantIds.length || form.Variants.length !== saved.Variants.length) return []
  if (form.Variants.some((variant, vi) => variant.ID !== sent.variantIds[vi])) return []
  if (form.Variants.some((variant, vi) =>
    variant.Tasks.length !== sent.taskIds[vi].length || variant.Tasks.length !== saved.Variants[vi].Tasks.length)) return []
  if (form.Variants.some((variant, vi) => variant.Tasks.some((task, ti) => task.ID !== sent.taskIds[vi][ti]))) return []

  const linkedUpdates: IdUpdate[] = []
  const otherUpdates: IdUpdate[] = []
  form.Variants.forEach((variant, vi) => {
    const updates = variant.LinkedTo ? linkedUpdates : otherUpdates
    const savedVariant = saved.Variants[vi]
    if (!variant.ID && savedVariant.ID) updates.push({ path: `Variants.${vi}.ID`, value: savedVariant.ID })
    variant.Tasks.forEach((task, ti) => {
      const id = savedVariant.Tasks[ti].ID
      if (!task.ID && id) updates.push({ path: `Variants.${vi}.Tasks.${ti}.ID`, value: id })
      // Same sequence guard per task for hints: a hint added/removed/moved while
      // saving must not inherit another hint's server ID.
      const hints = task.Hints ?? []
      const sentHints = sent.hintIds[vi]?.[ti] ?? []
      const savedHints = savedVariant.Tasks[ti].Hints ?? []
      if (hints.length !== sentHints.length || hints.length !== savedHints.length) return
      if (hints.some((hint, hi) => hint.ID !== sentHints[hi])) return
      hints.forEach((hint, hi) => {
        const hintId = savedHints[hi].ID
        if (!hint.ID && hintId) updates.push({ path: `Variants.${vi}.Tasks.${ti}.Hints.${hi}.ID`, value: hintId })
      })
    })
  })
  return [...linkedUpdates, ...otherUpdates]
}
