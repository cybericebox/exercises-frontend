"use client"

import { useState } from "react"
import Link from "next/link"
import { useWatch, type Control } from "react-hook-form"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { duplicateVariantGroups } from "@/lib/duplicateVariants"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"

export function DuplicateVariantAdvice({ control }: { control: Control<DraftFormValues> }) {
  const variants = useWatch({ control, name: "Variants" }) ?? []
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())
  return duplicateVariantGroups(variants).map((group) => {
    const signature = JSON.stringify(group.map((index) => variants[index]))
    if (dismissed.has(signature)) return null
    return <aside key={signature} className="mb-3 flex min-w-0 flex-wrap items-start justify-between gap-2 rounded-md border border-border p-3 text-sm">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium">{t("admin.exDuplicate.title", { variants: group.map((index) => index + 1).join(", ") })}</p>
        <p className="text-muted-foreground">{t("admin.exDuplicate.description")}</p>
        <Link href="/guide/variant/" className="text-primary underline underline-offset-2">{t("admin.exDuplicate.guide")}</Link>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={() => setDismissed((current) => new Set([...current, signature]))}>{t("admin.exDuplicate.dismiss")}</Button>
    </aside>
  })
}
