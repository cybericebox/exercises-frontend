import type { ReactNode } from "react"
import { cn } from "@/utils/cn"

/**
 * H12 — the strip over a list or a table: the title / switches on the left, ONE add action on the right. An «add» action
 * exists exactly once per view (never the same button above and below a table) and sits here, in the same place on
 * Пристрої, Зʼєднання and Змінні.
 */
export function ViewToolbar({ children, add, className }: { children?: ReactNode; add?: ReactNode; className?: string }) {
  return <div data-view-toolbar className={cn("flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-2", className)}>
    <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
    {add && <div className="flex shrink-0 items-center gap-2">{add}</div>}
  </div>
}
