/**
 * hintSync.ts — keeps a task's hints aligned across variants.
 *
 * Hint IDs and costs are shared position-wise by every variant (like task IDs
 * and difficulty); only the text is per variant. Every structural change
 * (add / remove / move / cost) is applied to the same task in all variants.
 */
import type { NormalizedHint } from "@/api/exercises/versions"
import { MAX_HINTS, MAX_HINT_COST } from "@/lib/hintLimits"

type HintVariant = { Tasks: { Hints: NormalizedHint[] }[] }

function mapTaskHints<V extends HintVariant>(variants: V[], taskIndex: number, change: (hints: NormalizedHint[]) => NormalizedHint[]): V[] {
  return variants.map((variant) => ({
    ...variant,
    Tasks: variant.Tasks.map((task, index) => index === taskIndex ? { ...task, Hints: change(task.Hints ?? []) } : task),
  }))
}

/** Cost from free text input: integers 0..MAX_HINT_COST, anything else → 0. */
export function clampHintCost(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(MAX_HINT_COST, Math.max(0, Math.trunc(value)))
}

export function canAddHint(hints: NormalizedHint[]): boolean {
  return hints.length < MAX_HINTS
}

/** Appends an empty hint (new: no ID, server assigns) to the task in every variant. */
export function addHint<V extends HintVariant>(variants: V[], taskIndex: number, cost = 0): V[] {
  const current = variants[0]?.Tasks[taskIndex]?.Hints ?? []
  if (!canAddHint(current)) return variants
  const next = clampHintCost(cost)
  return mapTaskHints(variants, taskIndex, (hints) => [...hints, { ID: "", Text: "", Cost: next }])
}

export function removeHint<V extends HintVariant>(variants: V[], taskIndex: number, hintIndex: number): V[] {
  return mapTaskHints(variants, taskIndex, (hints) => hints.filter((_, index) => index !== hintIndex))
}

/** Moves a hint from one position to another in every variant (text travels with it). */
export function moveHint<V extends HintVariant>(variants: V[], taskIndex: number, from: number, to: number): V[] {
  const length = variants[0]?.Tasks[taskIndex]?.Hints.length ?? 0
  if (from === to || from < 0 || to < 0 || from >= length || to >= length) return variants
  return mapTaskHints(variants, taskIndex, (hints) => {
    const next = [...hints]
    const [moved] = next.splice(from, 1)
    if (moved) next.splice(to, 0, moved)
    return next
  })
}

export function setHintCost<V extends HintVariant>(variants: V[], taskIndex: number, hintIndex: number, cost: number): V[] {
  const next = clampHintCost(cost)
  return mapTaskHints(variants, taskIndex, (hints) => hints.map((hint, index) => index === hintIndex ? { ...hint, Cost: next } : hint))
}

/** True when two variants' hints agree on count, IDs (when both known) and costs. */
export function hintsAligned(hints: NormalizedHint[], canonical: NormalizedHint[]): boolean {
  if (hints.length !== canonical.length) return false
  return hints.every((hint, index) => {
    const other = canonical[index]
    if (!other || hint.Cost !== other.Cost) return false
    return !hint.ID || !other.ID || hint.ID === other.ID
  })
}

/** A new variant copies the canonical hint IDs and costs, with empty texts. */
export function hintsForNewVariant(canonical: NormalizedHint[]): NormalizedHint[] {
  return canonical.map((hint) => ({ ID: hint.ID, Text: "", Cost: hint.Cost }))
}
