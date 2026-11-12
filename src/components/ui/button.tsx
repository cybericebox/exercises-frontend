import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/utils/cn"
import { Spinner } from "@/components/ui/spinner"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-[var(--ib-action-hover)]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-[color-mix(in_srgb,var(--ib-danger)_88%,var(--ib-ink))] active:bg-[color-mix(in_srgb,var(--ib-danger)_80%,var(--ib-ink))]",
        outline:
          "border border-border bg-card hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-accent",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // One control height: 36px, 44px on touch screens (every size; sm only narrows the padding).
        default: "h-9 px-4 pointer-coarse:h-11",
        sm: "h-9 rounded-md px-3 pointer-coarse:h-11",
        lg: "h-9 rounded-md px-8 pointer-coarse:h-11",
        icon: "h-9 w-9 pointer-coarse:h-11 pointer-coarse:w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Busy state: disables the button and shows the crest loader before the label. Pass it (true or false) on a button that can be busy: the button then keeps one size in both states. */
  busy?: boolean
  /** The operation label shown while busy (default: the same label). The button is as wide as the wider of idle and busy, in both states. */
  busyLabel?: string
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, busy, busyLabel, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || Boolean(busy)}
        aria-busy={busy || undefined}
        {...props}
      >
        {!asChild && (busyLabel || busy !== undefined) ? <span className="inline-grid items-center justify-items-center">
          {/* One grid cell holds the idle content, the busy content and its sizer: the button is as wide as the WIDER of idle and busy
              (loader + operation label, or loader + the same label) in both states, so it never resizes when work starts or ends.
              The sizer uses the real loader (its width is not 16 px), so idle and busy measure the same. */}
          <span aria-hidden="true" className="invisible col-start-1 row-start-1">{children}</span>
          <span data-busy-size aria-hidden="true" className="invisible col-start-1 row-start-1 inline-flex items-center"><Spinner size="sm" className="mr-2" />{busyLabel ?? children}</span>
          <span className="col-start-1 row-start-1 inline-flex items-center">{busy ? <><Spinner size="sm" className="mr-2" />{busyLabel ?? children}</> : children}</span>
        </span> : children}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
