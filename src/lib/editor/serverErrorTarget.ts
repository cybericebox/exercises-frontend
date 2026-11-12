/**
 * serverErrorTarget.ts — where a daemon error about the document sits in the editor form.
 *
 * A save or publish error names its place in the public context: `task` = the task key, `device` = the device name,
 * `field` = the path inside it (see serverFieldPath.ts), and, when the daemon says it, `variant` (a 1-based position or an id).
 * Resolution never guesses a field (AGENTS.md: an ambiguous server error is never assigned to a field):
 *   - exactly one candidate → its field; none or several → no target, the error stays form-level (a toast);
 *   - `variant` present → the candidates are that variant's only;
 *   - without it, answers (Check.Answer.*) may belong to any variant (a linked variant has its own answers), every other field of
 *     a task, the devices and the variables of the schema belong to the variants that own their structure (the not linked ones).
 */
import type { UseFormReturn } from "react-hook-form"
import { errorContext, exerciseErrorCode, exerciseErrorMessage } from "@/lib/exerciseErrors"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { describeIssue, type EditorIssue } from "./issues"
import { deviceErrorPath, taskFieldPath, variantFieldPath } from "./serverFieldPath"

type Path = (string | number)[]

const ERR = { taskKey: 23501, requires: 23502, checkMissing: 23503, stateNotForEvents: 23513 } as const

/** The index of the variant the context names: a 1-based position (digits) or an id; -1 when it is not in the form. */
function variantIndexOf(ref: string, draft: Pick<DraftFormValues, "Variants">): number {
  if (/^\d+$/.test(ref)) { const index = Number(ref) - 1; return index >= 0 && index < draft.Variants.length ? index : -1 }
  return draft.Variants.findIndex((variant) => variant.ID !== "" && variant.ID === ref)
}

/** The form paths a document error belongs to (exactly one), or null when it cannot be placed reliably. */
export function serverFieldTargets(error: unknown, draft: Pick<DraftFormValues, "Variants">): Path[] | null {
  const code = exerciseErrorCode(error)
  if (code === null) return null
  const { task, device, field = "", variant: variantRef } = errorContext(error)
  const out: Path[] = []
  const named = variantRef === undefined ? -1 : variantIndexOf(variantRef, draft)
  // A named variant that is not in the form cannot be placed; an unnamed one falls back to who owns the field.
  if (variantRef !== undefined && named < 0) return null
  const own = (vi: number) => (named >= 0 ? vi === named : draft.Variants[vi].LinkedTo === "")

  if (task) {
    let rest: Path | null = null
    if (field) rest = taskFieldPath(field)
    else if (code === ERR.taskKey) rest = ["Key"]
    else if (code === ERR.requires) rest = ["Requires"]
    else if (code === ERR.checkMissing || code === ERR.stateNotForEvents) rest = ["Check", "Kind"]
    if (!rest) return null
    const isAnswer = rest[0] === "Check" && rest[1] === "Answer" && rest[2] === "Values"
    draft.Variants.forEach((variant, vi) => {
      if (named >= 0 ? vi !== named : !isAnswer && !own(vi)) return
      const ti = variant.Tasks.findIndex((candidate) => candidate.Key === task)
      if (ti >= 0) out.push(["Variants", vi, "Tasks", ti, ...rest])
    })
  } else if (device) {
    const rest = deviceErrorPath(code, field)
    if (!rest) return null
    draft.Variants.forEach((variant, vi) => {
      if (!own(vi)) return
      const di = variant.Topology.Devices.findIndex((candidate) => candidate.Name === device)
      if (di >= 0) out.push(["Variants", vi, "Topology", "Devices", di, ...rest])
    })
  } else if (field) {
    const rest = variantFieldPath(field)
    if (!rest) return null
    draft.Variants.forEach((_, vi) => { if (own(vi)) out.push(["Variants", vi, ...rest]) })
  }
  return out.length === 1 ? out : null
}

/**
 * Puts a document error beside its field: `setError` on the one target, and returns the line for the problems dialog
 * («Перейти»). Null: the error is not placeable, the caller keeps it form-level.
 */
export function placeServerFieldError(error: unknown, form: Pick<UseFormReturn<DraftFormValues>, "setError" | "getValues">): EditorIssue[] | null {
  const targets = serverFieldTargets(error, form.getValues())
  if (!targets) return null
  const message = exerciseErrorMessage(error)
  const values = form.getValues()
  for (const path of targets) form.setError(path.join(".") as never, { type: "server", message })
  return targets.map((path) => describeIssue(values, path, message))
}
