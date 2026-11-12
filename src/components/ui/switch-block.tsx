"use client"

import { useId, type ReactNode } from "react"
import { Switch } from "@/components/ui/switch"
import { FieldLabel } from "@/components/ui/field-label"
import type { HelpContent } from "@/components/ui/help-content"
import { cn } from "@/utils/cn"

/**
 * H14 — the one pattern for «a switch with dependent fields». The switch row stands alone on its line (switch, the full
 * label on one line while it has room, «?» right after it). When ON, `children` (the fields) follow on the NEXT line as an
 * ordinary field row, their left edge on the label text. When OFF nothing is left behind: no empty gap.
 * Blocks of one section sit in a SwitchList, which gives them one gap, larger than the gap inside a block.
 */
export function SwitchBlock({ label, checked, onCheckedChange, help, helpText, disabled = false, unavailable, children, className, id }: {
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  help?: HelpContent
  helpText?: string
  disabled?: boolean
  /** Why the switch cannot be turned on (shown as the reason, the row stays visible and disabled). */
  unavailable?: string
  /** The dependent fields; shown only while the switch is on. */
  children?: ReactNode
  className?: string
  id?: string
}) {
  const generated = useId()
  const switchId = id ?? generated
  return <div data-switch-block className={cn("min-w-0", className)}>
    <div className="flex min-h-6 items-center gap-2">
      <Switch id={switchId} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled || Boolean(unavailable)} aria-label={label} />
      <FieldLabel text={label} htmlFor={switchId} help={help} helpText={helpText} labelClassName="font-normal" />
      {unavailable && <span className="text-xs text-muted-foreground">{unavailable}</span>}
    </div>
    {/* The fields start under the label text: switch 32 px + gap 8 px. */}
    {checked && children && <div data-switch-fields className="mt-2 min-w-0 pl-10">{children}</div>}
  </div>
}

/** Blocks of one section: one gap between them (larger than the gap between a switch and its fields). */
export function SwitchList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex min-w-0 flex-col gap-4", className)}>{children}</div>
}
