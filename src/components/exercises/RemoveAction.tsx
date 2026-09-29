import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { cn } from "@/utils/cn"

/** Consistent, compact destructive action for repeatable exercise form rows. */
export function RemoveAction({ ariaLabel, onClick, disabled = false, className, wrapperClassName }: {
  ariaLabel: string
  onClick: () => void
  disabled?: boolean
  className?: string
  wrapperClassName?: string
}) {
  return <HoverTooltip text={ariaLabel} className={wrapperClassName}><Button type="button" variant="ghost" size="icon" aria-label={ariaLabel} disabled={disabled}
    className={cn("shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive", className)}
    onClick={onClick}>
    <Trash2 aria-hidden="true" className="h-4 w-4" />
  </Button></HoverTooltip>
}
