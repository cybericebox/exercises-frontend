"use client"

import * as React from "react"
import { cn } from "@/utils/cn"

export interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  id?: string
  className?: string
  "aria-label"?: string
}

/**
 * Toggle switch — our own styled control (no Radix) drawn as the ds-v2
 * `.ib-switch` (32×18 track, 12px knob). Every on/off setting uses it; checkboxes
 * stay for picking several items and for acceptance. Accessible: role="switch" +
 * aria-checked, keyboard-activatable as a button.
 */
const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, disabled, id, className, ...props }, ref) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      id={id}
      ref={ref}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "group relative inline-block h-[18px] w-8 shrink-0 cursor-pointer rounded-full border transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ib-action)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked
          ? "border-[var(--ib-action)] bg-[var(--ib-action)]"
          : "border-[var(--ib-control)] bg-[var(--ib-field-bg,var(--ib-surface))] enabled:hover:border-[var(--ib-dim)]",
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "pointer-events-none absolute top-[2px] h-3 w-3 rounded-full transition-[left,background-color]",
          checked
            ? "left-4 bg-[var(--ib-on-action)]"
            : "left-[2px] bg-[var(--ib-control)] group-enabled:group-hover:bg-[var(--ib-dim)]",
        )}
      />
    </button>
  ),
)
Switch.displayName = "Switch"

export { Switch }
