/**
 * simplifyVariants.ts — the «Спростити» plan for many identical variants (typically after an import).
 *
 *  (a) identical variants (same content incl. flags and files) → the first one stays with the summed weight;
 *  (b) independent variants that differ from variant 1 only by flags and/or files → linked to variant 1.
 *
 * Weights are then reduced by their common divisor, so the issue proportions stay exactly the same.
 * Kept variants keep their ids; the removed ones disappear. Pure: nothing here mutates its input.
 */
import type { VariantFormValues } from "@/lib/exerciseSchemas"
import { MAX_VARIANT_WEIGHT } from "@/lib/exerciseSchemas"
import { variantSignature, type SignatureParts } from "@/lib/duplicateVariants"
import { dependentsOf, linkedFlagConflicts, syncLinkedVariants } from "@/lib/linkedVariants"
import { gcd, normalizeWeight } from "@/lib/variantWeights"

const SAME: SignatureParts = { flags: true, files: true, note: false, linked: true }
const SAME_BUT_OWN: SignatureParts = { flags: false, files: false, note: false, linked: false }

/** Why the variants that could be linked to variant 1 cannot be linked now. */
export type LinkBlock = "baseUnsaved" | "baseLinked"

export type SimplifyPlan = {
  /** Groups of identical variants, by their current index: `keep` stays, `removed` go away. */
  merges: { keep: number; removed: number[]; weight: number }[]
  /** Current indexes of the variants that become linked to variant 1. */
  links: number[]
  /** Variants that differ from variant 1 only by flags or files but cannot be linked now, and why. */
  blocked: { indexes: number[]; reason: LinkBlock } | null
  /** The rewritten list of variants. */
  variants: VariantFormValues[]
  /** Suggestions shown on the button: each merge group plus one for the links. */
  count: number
}

function reduced(weights: number[]): number[] {
  const divisor = weights.reduce((acc, weight) => gcd(acc, weight), 0) || 1
  return weights.map((weight) => weight / divisor)
}

/** The plan, or null when there is nothing to simplify. */
export function planSimplify(variants: VariantFormValues[]): SimplifyPlan | null {
  if (variants.length < 2) return null
  const weights = variants.map((variant) => normalizeWeight(variant.Weight))

  // (a) identical variants. A removed variant that is the base of others hands them to the kept one, which needs an id.
  const groups = new Map<string, number[]>()
  variants.forEach((variant, index) => {
    const key = variantSignature(variant, SAME)
    if (key !== null) groups.set(key, [...(groups.get(key) ?? []), index])
  })
  let merges = [...groups.values()].filter((group) => group.length > 1).map(([keep, ...rest]) => ({
    keep,
    removed: rest.filter((index) => variants[keep].ID !== "" || dependentsOf(variants, variants[index].ID).length === 0),
  })).filter((merge) => merge.removed.length > 0)

  // The daemon caps a weight; a group too heavy to hold its share stays partly unmerged.
  const finalWeights = () => {
    const removed = new Set(merges.flatMap((merge) => merge.removed))
    const summed = weights.map((weight, index) => {
      const merge = merges.find((candidate) => candidate.keep === index)
      return merge ? merge.removed.reduce((acc, other) => acc + weights[other], weight) : weight
    })
    const kept = summed.flatMap((weight, index) => (removed.has(index) ? [] : [{ index, weight }]))
    const scaled = reduced(kept.map((entry) => entry.weight))
    return new Map(kept.map((entry, k) => [entry.index, scaled[k]]))
  }
  let weightOf = finalWeights()
  while (merges.length > 0 && Math.max(...weightOf.values()) > MAX_VARIANT_WEIGHT) {
    const heaviest = merges.reduce((best, merge) => ((weightOf.get(merge.keep) ?? 0) > (weightOf.get(best.keep) ?? 0) ? merge : best))
    heaviest.removed = heaviest.removed.slice(0, -1)
    merges = merges.filter((merge) => merge.removed.length > 0)
    weightOf = finalWeights()
  }

  const removed = new Set(merges.flatMap((merge) => merge.removed))
  const keeperOf = new Map(merges.flatMap((merge) => merge.removed.map((index) => [index, merge.keep] as const)))
  const result = variants.map((variant, index) => {
    // The dependents of a removed base follow its identical kept twin.
    const base = variant.LinkedTo ? variants.findIndex((other) => other.ID !== "" && other.ID === variant.LinkedTo) : -1
    const LinkedTo = base >= 0 && keeperOf.has(base) ? variants[keeperOf.get(base) as number].ID : variant.LinkedTo
    return { ...variant, LinkedTo, Weight: weightOf.get(index) ?? 1 }
  })

  // (b) independent variants equal to variant 1 apart from flags and files.
  const first = result[0]
  // A linked variant 1 still compares (to say why nothing can be linked to it).
  const firstLoose = variantSignature({ ...first, LinkedTo: "" }, SAME_BUT_OWN)
  const candidates = firstLoose === null ? [] : result.flatMap((variant, index) => index > 0 && !removed.has(index) && !variant.LinkedTo
    && dependentsOf(result.filter((_, k) => !removed.has(k)), variant.ID).length === 0
    && variantSignature(variant, SAME_BUT_OWN) === firstLoose ? [index] : [])
  const links: number[] = []
  let blocked: SimplifyPlan["blocked"] = null
  if (candidates.length > 0) {
    if (!first.ID || first.LinkedTo) blocked = { indexes: candidates, reason: first.ID ? "baseLinked" : "baseUnsaved" }
    else {
      const withLinks = (indexes: number[]) => result.map((variant, k) => (indexes.includes(k) ? { ...variant, LinkedTo: first.ID } : variant)).filter((_, k) => !removed.has(k))
      for (const index of candidates) {
        // A fixed flag may not repeat inside a base and its linked variants: such a variant stays independent.
        if (linkedFlagConflicts(withLinks([...links, index])).length === linkedFlagConflicts(withLinks(links)).length) links.push(index)
      }
    }
  }

  if (merges.length === 0 && links.length === 0 && !blocked) return null
  // A linked variant's own flags and files follow the base's subtasks by id (as on the server): take the base ids by position.
  const linked = result.map((variant, index) => (links.includes(index)
    ? { ...variant, LinkedTo: first.ID, Tasks: variant.Tasks.map((task, position) => ({ ...task, ID: first.Tasks[position]?.ID ?? task.ID })) }
    : variant))
  const next = syncLinkedVariants(linked.filter((_, index) => !removed.has(index)).map((variant, index) => ({ ...variant, Index: index + 1 })))
  return {
    merges: merges.map((merge) => ({ ...merge, weight: weightOf.get(merge.keep) ?? 1 })),
    links,
    blocked,
    variants: next,
    count: merges.length + (links.length > 0 ? 1 : 0),
  }
}
