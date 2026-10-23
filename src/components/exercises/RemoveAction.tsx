import type { Ref } from "react"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { cn } from "@/utils/cn"

/**
 * Row actions (trash, download, rename) of a repeatable row: hidden until the row (a `group`) is hovered or holds the
 * focus, always shown on touch. They stay in the tab order, so keyboard focus reveals them.
 */
export const REVEAL_ON_HOVER = "opacity-0 transition-opacity motion-reduce:transition-none group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"

/** Consistent, compact destructive action for repeatable exercise form rows. */
export function RemoveAction({ ariaLabel, onClick, disabled = false, className, wrapperClassName, buttonRef }: {
  buttonRef?: Ref<HTMLButtonElement>
  ariaLabel: string
  onClick: () => void
  disabled?: boolean
  className?: string
  wrapperClassName?: string
}) {
  return <HoverTooltip text={ariaLabel} className={wrapperClassName}><Button ref={buttonRef} type="button" variant="ghost" size="icon" aria-label={ariaLabel} disabled={disabled}
    className={cn("shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive", className)}
    onClick={onClick}>
    <Trash2 aria-hidden="true" className="h-4 w-4" />
  </Button></HoverTooltip>
}
