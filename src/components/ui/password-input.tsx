"use client"

import * as React from "react"

import { Input, type InputProps } from "@/components/ui/input"
import { t } from "@/i18n/t"
import { cn } from "@/utils/cn"

type PasswordInputProps = Omit<InputProps, "type"> & {
  // Controlled reveal state, so a password + confirmation pair shows / hides together.
  shown?: boolean
  onShownChange?: (shown: boolean) => void
}

// ds-v2 .ib-input-wrap--password: input + «Показати» / «Сховати» text button (as in id-frontend).
const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, shown: shownProp, onShownChange, ...props }, ref) => {
    const [shownState, setShownState] = React.useState(false)
    const shown = shownProp ?? shownState
    const toggle = () => {
      setShownState(!shown)
      onShownChange?.(!shown)
    }
    return (
      <div className="relative w-full">
        <Input
          ref={ref}
          type={shown ? "text" : "password"}
          className={cn("pr-24", className)}
          {...props}
        />
        {!props.disabled && (
          <button
            type="button"
            onClick={toggle}
            aria-pressed={shown}
            className="absolute inset-y-1 right-1 inline-flex items-center rounded-sm px-2.5 text-[13px] font-medium text-[var(--ib-dim)] hover:bg-[var(--ib-hover)] hover:text-[var(--ib-ink)] focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[var(--ib-action)]"
          >
            {shown ? t("admin.password.hide") : t("admin.password.show")}
          </button>
        )}
      </div>
    )
  }
)
PasswordInput.displayName = "PasswordInput"

export { PasswordInput }
