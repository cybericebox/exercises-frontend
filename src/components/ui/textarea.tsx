import * as React from "react"

import { cn } from "@/utils/cn"

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, style, rows, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      // The rows height is the floor: dragging the grip can grow the field, not shrink it below that.
      style={rows ? { minHeight: `max(6rem, calc(${rows}lh + 1rem + 2px))`, ...style } : style}
      className={cn(
        "flex min-h-24 max-h-[80vh] w-full resize-y overflow-y-auto rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground transition-colors placeholder:text-placeholder focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
)
Textarea.displayName = "Textarea"

export { Textarea }
