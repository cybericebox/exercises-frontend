"use client"

import { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { pluralKey } from "@/lib/presetLabels"
import { t } from "@/i18n/t"

/**
 * The phone filter panel, as in the prototype: a sheet from the bottom over the catalog titled «Фільтри й
 * сортування» with «Скинути», the filters applied as they change (the list behind updates), and «Показати N
 * завдань» that closes it. Esc or a tap outside closes it too. A window grown past the phone width closes it: the
 * filters are inline there.
 */
export function FiltersSheet({ open, onOpenChange, active, total, onReset, children }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** How many filters are set (enables Reset when any is). */
  active: number
  /** How many tasks the current filters find. */
  total: number
  onReset: () => void
  children: React.ReactNode
}) {
  const returnFocusRef = useRef<HTMLElement | null>(null)
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
        onOpenAutoFocus={() => { returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null }}
        onCloseAutoFocus={(event) => {
          if (returnFocusRef.current?.isConnected) { event.preventDefault(); returnFocusRef.current.focus() }
        }}
        className="bottom-0 top-auto flex max-h-[88dvh] w-full max-w-none translate-y-0 flex-col gap-0 overflow-hidden rounded-t-lg p-0 sm:hidden">
        <header className="flex items-center justify-between gap-3 border-b border-border py-2 pl-4 pr-2">
          <DialogTitle className="text-base">{t("exercises.filter.sheetTitle")}</DialogTitle>
          <DialogDescription className="sr-only">{t("exercises.filter.label")}</DialogDescription>
          <Button type="button" variant="ghost" className="shrink-0" disabled={active === 0} onClick={onReset}>{t("exercises.filter.resetShort")}</Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">{children}</div>
        <footer className="border-t border-border px-4 py-3">
          <Button type="button" className="w-full" onClick={() => onOpenChange(false)}>{t(pluralKey("exercises.filter.show", total), { count: total })}</Button>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
