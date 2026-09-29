/**
 * hintSync.ts — keeps a task's hints aligned across variants.
 *
 * Hint IDs and levels are shared position-wise by every variant (like task IDs
 * and difficulty); only the text is per variant. Every structural change
 * (add / remove / move / level) is applied to the same task in all variants.
 */
import type { HintLevel, NormalizedHint } from "@/api/exercises/versions"
import { MAX_HINTS } from "@/lib/hintLimits"

type HintVariant = { Tasks: { Hints: NormalizedHint[] }[] }

function mapTaskHints<V extends HintVariant>(variants: V[], taskIndex: number, change: (hints: NormalizedHint[]) => NormalizedHint[]): V[] {
  return variants.map((variant) => ({
    ...variant,
    Tasks: variant.Tasks.map((task, index) => index === taskIndex ? { ...task, Hints: change(task.Hints ?? []) } : task),
  }))
}

export function canAddHint(hints: NormalizedHint[]): boolean {
  return hints.length < MAX_HINTS
}

/** Appends an empty hint (new: no ID, server assigns) to the task in every variant. */
export function addHint<V extends HintVariant>(variants: V[], taskIndex: number, level: HintLevel = "nudge"): V[] {
  const current = variants[0]?.Tasks[taskIndex]?.Hints ?? []
  if (!canAddHint(current)) return variants
  return mapTaskHints(variants, taskIndex, (hints) => [...hints, { ID: "", Text: "", Level: level }])
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

export function setHintLevel<V extends HintVariant>(variants: V[], taskIndex: number, hintIndex: number, level: HintLevel): V[] {
  return mapTaskHints(variants, taskIndex, (hints) => hints.map((hint, index) => index === hintIndex ? { ...hint, Level: level } : hint))
}

/** True when two variants' hints agree on count, IDs (when both known) and levels. */
export function hintsAligned(hints: NormalizedHint[], canonical: NormalizedHint[]): boolean {
  if (hints.length !== canonical.length) return false
  return hints.every((hint, index) => {
    const other = canonical[index]
    if (!other || hint.Level !== other.Level) return false
    return !hint.ID || !other.ID || hint.ID === other.ID
  })
}

/** A new variant copies the canonical hint IDs and levels, with empty texts. */
export function hintsForNewVariant(canonical: NormalizedHint[]): NormalizedHint[] {
  return canonical.map((hint) => ({ ID: hint.ID, Text: "", Level: hint.Level }))
}
