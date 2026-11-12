/**
 * serverErrorTarget.ts — where a daemon error about the document sits in the editor form.
 *
 * A save or publish error names its place in the public context: `task` = the task key, `device` = the device name,
 * `field` = the path inside it (see serverFieldPath.ts), and, when the daemon says it, `variant` (an int: the 1-based position of the variant in the version).
 * Resolution never guesses a field (AGENTS.md: an ambiguous server error is never assigned to a field):
 *   - exactly one candidate → its field; none or several → no target, the error stays form-level (a toast);
 *   - `variant` present → the candidates are that variant's only;
 *   - without it, answers (Check.Answer.*) may belong to any variant (a linked variant has its own answers), every other field of
 *     a task, the devices and the variables of the schema belong to the variants that own their structure (the not linked ones).
 */
import { get, set, type FieldErrors, type Resolver, type UseFormReturn } from "react-hook-form"
import { errorContext, exerciseErrorCode, exerciseErrorMessage } from "@/lib/exerciseErrors"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { describeIssue, type EditorIssue } from "./issues"
import { deviceErrorPath, taskFieldPath, variantFieldPath } from "./serverFieldPath"

type Path = (string | number)[]

const ERR = { taskKey: 23501, requires: 23502, checkMissing: 23503, stateNotForEvents: 23513 } as const

/** The index of the variant the context names: `variant` is the 1-based position in the version's Variants (an int on the wire); -1 when it is not in the form. */
function variantIndexOf(ref: string, draft: Pick<DraftFormValues, "Variants">): number {
  if (!/^\d+$/.test(ref)) return -1
  const index = Number(ref) - 1
  return index >= 0 && index < draft.Variants.length ? index : -1
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
export function placeServerFieldError(error: unknown, form: Pick<UseFormReturn<DraftFormValues>, "setError" | "getValues"> & { control?: object }): EditorIssue[] | null {
  const targets = serverFieldTargets(error, form.getValues())
  if (!targets) return null
  const message = exerciseErrorMessage(error)
  const values = form.getValues()
  const memory = form.control ? serverErrorMemory(form.control) : null
  for (const path of targets) {
    const name = path.join(".")
    form.setError(name as never, { type: "server", message })
    memory?.set(name, { message, value: snapshot(get(values, name)) })
  }
  return targets.map((path) => describeIssue(values, path, message))
}

// ── Memory of the server's field errors ───────────────────────────────────────────────────────────────────────────
// react-hook-form validates a field when it is left (blur) and drops an error that the client rules do not know: the server's
// message would vanish the moment the user moves the focus. The errors the server put on fields are remembered with the value
// they were about, and the field validation of the resolver puts them back while the value is the same; a changed value, a full
// check (publish), a save that went through or a new publish forgets them.

/** The value a server error was about; an absent value and an empty list are the same (a field that mounts normalizes one to the other). */
function snapshot(value: unknown): string {
  return JSON.stringify(value === undefined || value === "" || (Array.isArray(value) && value.length === 0) ? null : value)
}

export type ServerErrorMemory = Map<string, { message: string; value: string }>

const memories = new WeakMap<object, ServerErrorMemory>()

/** Ties a memory to a form's control: the hook that built the resolver registers the one it gave it. */
export function registerServerErrorMemory(control: object, memory: ServerErrorMemory): void {
  memories.set(control, memory)
}

/** The memory of a form (created on first use), keyed by its control. */
export function serverErrorMemory(control: object): ServerErrorMemory {
  let memory = memories.get(control)
  if (!memory) { memory = new Map(); memories.set(control, memory) }
  return memory
}

/** Forgets every remembered server error of a form (a new publish, a save that went through). */
export function forgetServerErrors(form: { control?: object }): void {
  if (form.control) memories.get(form.control)?.clear()
}

/** Makes a resolver put the remembered server errors back on the fields it validates (blur/change), while their value is unchanged. */
export function withServerErrors<T extends Record<string, unknown>>(resolver: Resolver<T>, memory: ServerErrorMemory): Resolver<T> {
  return async (values, context, options) => {
    const result = await resolver(values, context, options)
    if (memory.size === 0 || !options.names || options.names.length === 0) return result
    const errors = { ...(result.errors ?? {}) } as FieldErrors<T>
    let merged = false
    for (const [path, entry] of [...memory]) {
      if (snapshot(get(values, path)) !== entry.value) { memory.delete(path); continue }
      if (get(errors, path)) continue
      set(errors, path, { type: "server", message: entry.message })
      merged = true
    }
    return merged ? { values: {} as never, errors } : result
  }
}
