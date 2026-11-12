/**
 * variantsModel.ts — the pure rules of the «Усі варіанти» list: the position of a base, the share of a weight, the
 * variants that are not needed, the one-line summary of what a variant has of its own, and the structural edits
 * (duplicate, detach, delete). Nothing here mutates its input.
 */
import { copyVariant, dependentsOf, ownImages } from "@/lib/linkedVariants"
import { deliveriesOfTask } from "@/lib/editor/refs"
import { pluralKey } from "@/lib/presetLabels"
import type { VariantFormValues } from "@/lib/exerciseSchemas"

type Translate = (key: string, vars?: Record<string, string | number>) => string

/** Position of the base of a variant, -1 when it has none (or the base is not saved/present). */
export function baseIndexOf(variants: Pick<VariantFormValues, "ID" | "LinkedTo">[], index: number): number {
  const linkedTo = variants[index]?.LinkedTo
  return linkedTo ? variants.findIndex((candidate) => candidate.ID !== "" && candidate.ID === linkedTo) : -1
}

/** Rows in display order: every base is followed by the variants based on it. */
export function displayOrder(variants: Pick<VariantFormValues, "ID" | "LinkedTo">[]): number[] {
  const order: number[] = []
  const add = (index: number) => {
    order.push(index)
    variants.forEach((_, other) => { if (variants[other].LinkedTo !== "" && baseIndexOf(variants, other) === index) add(other) })
  }
  variants.forEach((variant, index) => { if (variant.LinkedTo === "" || baseIndexOf(variants, index) < 0) add(index) })
  return order
}

/** The share of every weight in percent (rounded; 0 when nothing is given out). */
export function weightShares(weights: number[]): number[] {
  const total = weights.reduce((sum, weight) => sum + (Number.isFinite(weight) ? weight : 0), 0)
  return weights.map((weight) => (total > 0 && Number.isFinite(weight) ? Math.round((weight / total) * 100) : 0))
}

/**
 * Linked variants that differ from their base only by an answer that reaches the lab need not be variants at all: the
 * task can hold several values or a template (schema 4.3). True when some base has such a group.
 */
export function needlessVariants(variants: VariantFormValues[]): boolean {
  return variants.some((base, baseIndex) => {
    if (base.LinkedTo) return false
    const kids = variants.filter((_, index) => baseIndexOf(variants, index) === baseIndex)
    if (kids.length === 0) return false
    if (kids.some((kid) => ownImages(kid, base).length > 0 || kid.Tasks.some((task) => task.Attachments.length > 0))) return false
    return base.Tasks.some((task, position) => task.Check.Kind === "answer" && deliveriesOfTask(base.Topology, task.Key).length > 0
      && kids.some((kid) => (kid.Tasks[position]?.Check.Answer.Values.length ?? 0) > 0))
  })
}

/** One line: what the variant has of its own (the «Чим відрізняється» column). */
export function variantSummary(variants: VariantFormValues[], index: number, t: Translate): string {
  const variant = variants[index]
  const base = baseIndexOf(variants, index)
  if (base < 0) {
    const kids = variants.filter((_, other) => baseIndexOf(variants, other) === index).length
    return index === 0 || kids > 0
      ? t(kids > 0 ? "ed.a.variants.sum.ownWithKids" : "ed.a.variants.sum.own", { count: kids })
      : t("ed.a.variants.sum.separate")
  }
  const baseVariant = variants[base]
  const parts: string[] = []
  const answers = variant.Tasks.filter((task, position) => task.Check.Kind === "answer" && task.Check.Answer.Values.length > 0 && baseVariant.Tasks[position]?.Check.Kind === "answer")
  if (answers.length > 0) {
    const flags = answers.filter((task) => task.Check.Answer.Type === "flag").length
    parts.push(t(flags === answers.length ? pluralKey("ed.a.variants.sum.flags", flags) : pluralKey("ed.a.variants.sum.answers", answers.length), { count: answers.length }))
  }
  const files = variant.Tasks.reduce((sum, task) => sum + task.Attachments.length, 0)
  if (files > 0) parts.push(t(pluralKey("ed.a.variants.sum.files", files), { count: files }))
  const images = ownImages(variant, baseVariant)
  if (images.length > 0) parts.push(t(pluralKey("ed.a.variants.sum.images", images.length), { devices: images.map((image) => image.Name).join(", ") }))
  return parts.join(" · ") || t("ed.a.variants.sum.nothing")
}

/** The variants without the one at `index`; the variants based on it keep their content and become separate. */
export function removeVariantAt(variants: VariantFormValues[], index: number): VariantFormValues[] {
  const removed = variants[index]
  const dependents = new Set(dependentsOf(variants, removed?.ID ?? ""))
  return variants.flatMap((variant, position) => position === index ? [] : [dependents.has(position) ? { ...variant, LinkedTo: "" } : variant])
}

/** The variant becomes separate: it keeps its content, later changes of the base do not reach it. */
export function detachVariantAt(variants: VariantFormValues[], index: number): VariantFormValues[] {
  return variants.map((variant, position) => position === index ? { ...variant, LinkedTo: "", ImageOverrides: [] } : variant)
}

/**
 * A separate copy of what the participant gets from the variant (a linked variant takes what it does not own from its
 * base). It goes after the variant and the variants based on it.
 */
export function duplicateVariantAt(variants: VariantFormValues[], index: number): { variants: VariantFormValues[]; at: number } {
  const source = variants[index]
  const base = baseIndexOf(variants, index)
  const copy = copyVariant(source, variants.length + 1)
  if (base >= 0) {
    copy.Tasks.forEach((task, position) => {
      const from = variants[base].Tasks[position]
      if (!from) return
      if (task.Check.Kind === "answer" && task.Check.Answer.Values.length === 0) task.Check.Answer.Values = [...from.Check.Answer.Values]
      if (task.Attachments.length === 0) task.Attachments = from.Attachments.map((file) => ({ ...file }))
    })
  }
  let at = index + 1
  while (source.ID !== "" && at < variants.length && variants[at].LinkedTo === source.ID) at += 1
  return { variants: [...variants.slice(0, at), copy, ...variants.slice(at)], at }
}
