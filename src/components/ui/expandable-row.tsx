"use client"

import type { ReactNode } from "react"
import { ChevronRight } from "lucide-react"
import { t } from "@/i18n/t"
import { RowActions, type RowAction } from "@/components/exercises/RowActions"
import { cn } from "@/utils/cn"

/**
 * H13 — a row that opens by its chevron (or by a click on the row) and has NO pencil: one way to open, one affordance.
 * The chevron has its own column and never touches the frame. The closed row is plain read-only text (`summary`), the open
 * row shows `children` (the form) under it. Row actions (the trash, «show on the schema») appear on hover or focus only.
 */
export function ExpandableRow({ open, onOpenChange, summary, actions, children, ariaLabel, className, disabled = false }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The closed row as plain text, laid out by the caller (a grid shared with the table header). */
  summary: ReactNode
  actions?: RowAction[]
  children?: ReactNode
  ariaLabel: string
  className?: string
  disabled?: boolean
}) {
  return <div data-expandable-row data-open={open || undefined} className={cn("group min-w-0 border-b border-border last:border-b-0", className)}>
    <div className="flex min-w-0 items-center">
      <button type="button" aria-expanded={open} aria-label={`${open ? t("ed.ui.collapse") : t("ed.ui.expand")}: ${ariaLabel}`} disabled={disabled}
        onClick={() => onOpenChange(!open)}
        className="flex h-10 w-8 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50">
        <ChevronRight aria-hidden="true" className={cn("h-4 w-4 transition-transform motion-reduce:transition-none", open && "rotate-90")} />
      </button>
      {/* A click on the closed row opens it, like the chevron; text inside stays selectable. */}
      <div className="min-w-0 flex-1 cursor-default py-2" onClick={(event) => {
        if (disabled || (event.target as HTMLElement).closest("a,button,input,select,textarea,[role=button]")) return
        if (window.getSelection()?.toString()) return
        onOpenChange(!open)
      }}>{summary}</div>
      {actions && actions.length > 0 && !open && <RowActions actions={actions} className="shrink-0 pr-1" />}
    </div>
    {open && children && <div className="min-w-0 pb-3 pl-8 pr-1">{children}</div>}
  </div>
}
