"use client"

import type { ReactNode } from "react"
import { X } from "lucide-react"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { cn } from "@/utils/cn"

/**
 * H10 — the one side panel for every node kind (device, network, VPN gateway, Internet): a read-only summary, no editable
 * fields. The header holds the name and the close cross only; the footer is pinned to the bottom and holds the actions
 * («Налаштувати», the trash «Видалити»). The panel spans the full height of its area (H5), rows at the top.
 */
export function SidePanel({ title, subtitle, onClose, footer, children, className }: {
  title: string
  subtitle?: string
  onClose: () => void
  /** The pinned actions; a control that cannot act stays here disabled with its reason. */
  footer?: ReactNode
  children: ReactNode
  className?: string
}) {
  return <aside data-side-panel aria-label={title} className={cn("flex h-full min-h-0 min-w-0 flex-col rounded-md border border-border bg-card", className)}>
    <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
      <div className="min-w-0">
        <h3 className="break-words text-sm font-semibold leading-5 text-foreground">{title}</h3>
        {subtitle && <p className="mt-0.5 break-words text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <HoverTooltip text={t("ed.ui.close")}>
        <Button type="button" variant="ghost" size="icon" className="-mr-2 -mt-1 h-8 w-8 shrink-0" aria-label={t("ed.ui.close")} onClick={onClose}><X aria-hidden="true" className="h-4 w-4" /></Button>
      </HoverTooltip>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">{children}</div>
    {footer && <footer className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">{footer}</footer>}
  </aside>
}

export type SummaryRow = {
  key: string
  label: string
  /** Plain words; on/off is «Увімкнено» / «Вимкнено», never a switch. */
  value: ReactNode
  /** A click opens the editor on the section that holds this fact. */
  onSelect?: () => void
}

/**
 * E4a — a two-column definition list with hairline rows: no icons, no underlined labels. A row with `onSelect` is one
 * button, so the whole row is the affordance.
 */
export function SummaryList({ rows, className }: { rows: SummaryRow[]; className?: string }) {
  return <dl className={cn("m-0 min-w-0", className)}>
    {rows.map((row) => {
      const body = <>
        <dt className="text-sm text-muted-foreground">{row.label}</dt>
        <dd className="m-0 min-w-0 break-words text-sm text-foreground">{row.value}</dd>
      </>
      const grid = "grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-baseline gap-3 border-b border-border py-2 last:border-b-0"
      return row.onSelect
        ? <button key={row.key} type="button" onClick={row.onSelect} className={cn(grid, "w-full text-left hover:bg-[var(--ib-hover)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary")}>{body}</button>
        : <div key={row.key} className={grid}>{body}</div>
    })}
  </dl>
}
