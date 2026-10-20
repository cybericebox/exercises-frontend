"use client"

import { useEffect, useRef } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { t } from "@/i18n/t"

/**
 * The phone filter panel: a sheet from the bottom over the catalog, filters applied as they change (the table
 * behind updates). Esc closes the sheet unless a filter list is open (that Esc closes the list first). A window grown
 * past the phone width closes it: the filters are inline there.
 */
export function FiltersSheet({ open, onOpenChange, active, onReset, children }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** How many filters are set (enables Reset when any is). */
  active: number
  onReset: () => void
  children: React.ReactNode
}) {
  const contentRef = useRef<HTMLDivElement>(null)
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
        ref={contentRef}
        onOpenAutoFocus={(event) => {
          returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
          const search = contentRef.current?.querySelector<HTMLInputElement>('input[type="search"]')
          if (search) { event.preventDefault(); search.focus() }
        }}
        onCloseAutoFocus={(event) => {
          if (returnFocusRef.current?.isConnected) { event.preventDefault(); returnFocusRef.current.focus() }
        }}
        onEscapeKeyDown={(event) => {
          const focused = document.activeElement
          if (focused?.getAttribute("role") === "combobox" && focused.getAttribute("aria-expanded") === "true") event.preventDefault()
        }}
        className="bottom-0 top-auto flex max-h-[88dvh] w-full max-w-none translate-y-0 flex-col gap-0 overflow-hidden rounded-t-lg p-0 sm:hidden">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <DialogTitle className="text-base">{t("exercises.filter.open")}</DialogTitle>
          <DialogDescription className="sr-only">{t("exercises.filter.label")}</DialogDescription>
          <DialogClose asChild><Button type="button" variant="ghost" size="icon" className="h-11 w-11" aria-label={t("exercises.filter.close")}><X aria-hidden="true" className="h-4 w-4" /></Button></DialogClose>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">{children}</div>
        <footer className="flex items-center gap-2 border-t border-border px-4 py-3">
          <Button type="button" variant="ghost" className="h-11 shrink-0" disabled={active === 0} onClick={onReset}>{t("exercises.filter.reset")}</Button>
          <Button type="button" className="h-11 flex-1" onClick={() => onOpenChange(false)}>{t("exercises.filter.done")}</Button>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
