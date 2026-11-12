"use client"

import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { TestVariantOption } from "../../ExerciseHeader"

export type TestStartDialogProps = {
  /** The variants with the reason when one cannot be started. */
  variants: TestVariantOption[]
  busy: boolean
  /** Starts the test of a variant; the page checks the draft first. */
  onStart: (variantIndex: number) => void
  onClose: () => void
}

/** The start of a test lab (package D replaces the body: variant, run length, the check before the start). */
export function TestStartDialog({ variants, busy, onStart, onClose }: TestStartDialogProps) {
  return <Dialog open onOpenChange={(next) => { if (!next && !busy) onClose() }}>
    <DialogContent>
      <DialogHeader><DialogTitle>{t("admin.exPage.action.testMenu")}</DialogTitle><DialogDescription className="sr-only">{t("admin.exPage.action.testMenu")}</DialogDescription></DialogHeader>
      <div className="flex flex-col gap-2">
        {variants.map((variant) => <div key={variant.index}>
          <Button type="button" variant="outline" className="w-full justify-start" disabled={variant.disabled || busy} onClick={() => onStart(variant.index)}>{variant.label}</Button>
          {variant.disabled && variant.reason && <p className="mt-1 text-xs text-muted-foreground">{variant.reason}</p>}
        </div>)}
      </div>
    </DialogContent>
  </Dialog>
}
