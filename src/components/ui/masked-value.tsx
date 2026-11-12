"use client"

import { useState, type InputHTMLAttributes } from "react"
import { Eye, EyeOff } from "lucide-react"
import { t } from "@/i18n/t"
import { Input } from "@/components/ui/input"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { cn } from "@/utils/cn"

function EyeButton({ shown, onToggle, className }: { shown: boolean; onToggle: () => void; className?: string }) {
  const label = shown ? t("ed.ui.hideValue") : t("ed.ui.showValue")
  return <HoverTooltip text={label} className={className}>
    <button type="button" onClick={onToggle} aria-pressed={shown} aria-label={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-[var(--ib-hover)] hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary">
      {shown ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
    </button>
  </HoverTooltip>
}

/**
 * An editable value that is shown as dots by default, with an eye to reveal it (H12: variables of the schema and
 * environment variables). Not for secrets that are write-only on the server: those use SecretInput.
 */
export function MaskedInput({ className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [shown, setShown] = useState(false)
  return <div className="relative w-full">
    <Input {...props} type={shown ? "text" : "password"} autoComplete="off" className={cn("pr-10", className)} />
    <span className="absolute inset-y-0 right-1 flex items-center"><EyeButton shown={shown} onToggle={() => setShown(!shown)} /></span>
  </div>
}

/** The same value as plain read-only text in a closed table row: dots, with an eye. */
export function MaskedText({ value, className }: { value: string; className?: string }) {
  const [shown, setShown] = useState(false)
  return <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
    <span className={cn("min-w-0 truncate", shown ? "font-mono text-[13px]" : "tracking-widest text-muted-foreground")}>
      {shown ? value : value === "" ? "" : "•".repeat(Math.min(Math.max(value.length, 6), 12))}
    </span>
    {value !== "" && <EyeButton shown={shown} onToggle={() => setShown(!shown)} />}
  </span>
}
