import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { cn } from "@/utils/cn"

export type RowAction = { key: string; label: string; icon: ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean }

/**
 * Icon actions at the end of a table row, as in /manage: revealed on row hover
 * or keyboard focus (always visible on touch), each with a tooltip. The row
 * needs the `group` class.
 */
export function RowActions({ actions, className }: { actions: RowAction[]; className?: string }) {
  return <div className={cn("flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 motion-reduce:transition-none", className)}>
    {actions.map((action) => <HoverTooltip key={action.key} text={action.label}>
      <Button type="button" variant="ghost" size="icon" aria-label={action.label} disabled={action.disabled} onClick={action.onSelect}
        className={cn("h-8 w-8", action.danger ? "text-destructive hover:bg-destructive/10 hover:text-destructive" : "text-muted-foreground hover:text-foreground")}>
        {action.icon}
      </Button>
    </HoverTooltip>)}
  </div>
}
