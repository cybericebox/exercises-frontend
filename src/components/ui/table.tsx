import { cn } from "@/utils/cn"

/**
 * The one table of the app (DS `table`): the scroll region is focusable and named, `<thead>` stays
 * in every state, a state (loading, empty, error) is one full-width row in its own `<tbody>`.
 */
export function Table({ label, className, regionClassName, regionRef, busy, children }: { label: string; className?: string; regionClassName?: string; regionRef?: React.Ref<HTMLDivElement>; busy?: boolean; children: React.ReactNode }) {
  return (
    <div ref={regionRef} role="region" aria-label={label} aria-busy={busy} tabIndex={0} className={cn("relative min-h-0 flex-1 overflow-auto focus-visible:outline-2 focus-visible:outline-primary", regionClassName)}>
      <table aria-label={label} className={cn("w-full border-separate border-spacing-0 text-sm", className)}>{children}</table>
    </div>
  )
}

export const TABLE_HEAD_ROW = "h-10 text-left text-[length:var(--ib-fs-13)] font-medium text-[var(--ib-dim)]"
export const TABLE_HEAD_CELL = "sticky top-0 z-10 border-b border-border bg-card px-3 text-left font-medium"
export const TABLE_CELL = "border-b border-border/50 px-3 py-2"
export const TABLE_ROW = "h-10 transition-colors hover:bg-[var(--ib-hover)]"

/** Loading, empty and error: one centred row that keeps the block size across states. */
export function TableState({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tbody className="ib-table__state">
      <tr>
        <td colSpan={colSpan} className="p-0">
          <div className="flex min-h-64 items-center justify-center">{children}</div>
        </td>
      </tr>
    </tbody>
  )
}
