"use client"

import * as React from "react"
import { cn } from "@/utils/cn"

export interface CheckboxProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Optional label rendered alongside the checkbox */
  label?: React.ReactNode
}

/**
 * Simple accessible checkbox using a native <input type="checkbox">.
 * Keeps the bundle lean — no Radix dependency needed for a single checkbox.
 */
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, id, ...props }, ref) => {
    const generatedId = React.useId()
    const inputId = id ?? generatedId
    return (
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          id={inputId}
          ref={ref}
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border border-input accent-primary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          {...props}
        />
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm leading-snug cursor-pointer select-none"
          >
            {label}
          </label>
        )}
      </div>
    )
  }
)
Checkbox.displayName = "Checkbox"

export { Checkbox }
