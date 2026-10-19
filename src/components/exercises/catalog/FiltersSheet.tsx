"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { t } from "@/i18n/t"

/**
 * The phone filter panel: a sheet from the bottom over the catalog, filters applied as they change (the table
 * behind updates). Esc closes the sheet unless a filter list is open (that Esc closes the list first). A window grown
 * past the phone width closes it: the filters are inline there.
 */
export function FiltersSheet({ open, onOpenChange, active, onReset, children }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** How many filters are set (the reset shows when any is). */
  active: number
  onReset: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!open || typeof window.matchMedia !== "function") return
    const wide = window.matchMedia("(min-width: 640px)")
    const close = () => { if (wide.matches) onOpenChange(false) }
    close()
    wide.addEventListener("change", close)
    return () => wide.removeEventListener("change", close)
  }, [open, onOpenChange])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onEscapeKeyDown={(event) => {
          const focused = document.activeElement
          if (focused?.getAttribute("role") === "combobox" && focused.getAttribute("aria-expanded") === "true") event.preventDefault()
        }}
        className="bottom-0 top-auto flex max-h-[88dvh] w-full max-w-none translate-y-0 flex-col gap-0 overflow-hidden rounded-t-lg p-0 sm:hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <DialogTitle className="text-base">{t("exercises.filter.open")}</DialogTitle>
          <DialogDescription className="sr-only">{t("exercises.filter.label")}</DialogDescription>
          {active > 0 && <Button type="button" variant="ghost" size="sm" onClick={onReset}>{t("exercises.filter.reset")}</Button>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">{children}</div>
        <div className="border-t border-border px-4 py-3">
          <Button type="button" className="h-10 w-full" onClick={() => onOpenChange(false)}>{t("exercises.filter.done")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
