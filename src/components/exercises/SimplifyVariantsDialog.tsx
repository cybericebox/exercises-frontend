"use client"

import { ArrowRight, Copy, Link2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { t } from "@/i18n/t"
import type { SimplifyPlan } from "@/lib/simplifyVariants"

/** Variant numbers (from indexes) with runs folded: 2–4, 7. */
export function variantNumbers(indexes: number[]): string {
  const numbers = [...indexes].sort((a, b) => a - b).map((index) => index + 1)
  const runs: string[] = []
  for (let start = 0; start < numbers.length;) {
    let end = start
    while (end + 1 < numbers.length && numbers[end + 1] === numbers[end] + 1) end += 1
    runs.push(end - start >= 2 ? `${numbers[start]}–${numbers[end]}` : numbers.slice(start, end + 1).join(", "))
    start = end + 1
  }
  return runs.join(", ")
}

/**
 * What «Спростити» will do: the identical groups that collapse into one weighted variant, the variants that become
 * linked to variant 1, before → after, and which variants go away. Applying it only rewrites the form; the autosave saves it.
 */
export function SimplifyVariantsDialog({ plan, before, onApply, onClose }: { plan: SimplifyPlan; before: number; onApply: () => void; onClose: () => void }) {
  const removed = plan.merges.flatMap((merge) => merge.removed)
  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{t("admin.exSimplify.title")}</DialogTitle>
        <DialogDescription>{t("admin.exSimplify.description")}</DialogDescription>
      </DialogHeader>
      <ul className="simplify-list">
        {plan.merges.map((merge) => <li key={merge.keep} className="simplify-item">
          <Copy aria-hidden="true" className="h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">{t("admin.exSimplify.sameTitle", { variants: variantNumbers([merge.keep, ...merge.removed]) })}</p>
            <p className="text-muted-foreground">{t("admin.exSimplify.sameResult", { n: merge.keep + 1, weight: merge.weight })}</p>
          </div>
        </li>)}
        {plan.links.length > 0 && <li className="simplify-item">
          <Link2 aria-hidden="true" className="h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">{t("admin.exSimplify.linkTitle", { variants: variantNumbers(plan.links) })}</p>
            <p className="text-muted-foreground">{t("admin.exSimplify.linkResult")}</p>
          </div>
        </li>}
        {plan.blocked && <li className="simplify-item text-muted-foreground">
          <Link2 aria-hidden="true" className="h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">{t("admin.exSimplify.linkTitle", { variants: variantNumbers(plan.blocked.indexes) })}</p>
            <p>{t(`admin.exSimplify.blocked.${plan.blocked.reason}`)}</p>
          </div>
        </li>}
      </ul>
      <div className="simplify-outcome">
        <div><p className="text-muted-foreground">{t("admin.exSimplify.before")}</p><p className="simplify-figure">{t("admin.exSimplify.variantsCount", { count: before })}</p></div>
        <ArrowRight aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
        <div><p className="text-muted-foreground">{t("admin.exSimplify.after")}</p>
          <p className="simplify-figure">{t("admin.exSimplify.afterValue", { count: plan.variants.length, weights: plan.variants.map((variant) => variant.Weight).join(" : ") })}</p></div>
      </div>
      <div className="space-y-1 text-sm">
        <p>{t("admin.exSimplify.proportions")}</p>
        {removed.length > 0 && <p className="text-muted-foreground">{t("admin.exSimplify.removed", { variants: variantNumbers(removed) })}</p>}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>{t("admin.exSimplify.cancel")}</Button>
        <Button type="button" onClick={onApply}>{t("admin.exSimplify.apply")}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
