"use client"

import * as React from "react"
import { Eye, EyeOff } from "lucide-react"

import { Input, type InputProps } from "@/components/ui/input"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { t } from "@/i18n/t"
import { cn } from "@/utils/cn"

// Password field with an eye button on the right that reveals / hides the value.
const PasswordInput = React.forwardRef<HTMLInputElement, Omit<InputProps, "type">>(
  ({ className, ...props }, ref) => {
    const [shown, setShown] = React.useState(false)
    const label = shown ? t("admin.password.hide") : t("admin.password.show")
    return (
      <div className="relative w-full">
        <Input
          ref={ref}
          type={shown ? "text" : "password"}
          className={cn(!props.disabled && "pr-10", className)}
          {...props}
        />
        {!props.disabled && (
          <HoverTooltip text={label} className="absolute inset-y-0 right-1 items-center">
            <button
              type="button"
              onClick={() => setShown((s) => !s)}
              aria-label={label}
              aria-pressed={shown}
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {shown ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
            </button>
          </HoverTooltip>
        )}
      </div>
    )
  }
)
PasswordInput.displayName = "PasswordInput"

export { PasswordInput }
