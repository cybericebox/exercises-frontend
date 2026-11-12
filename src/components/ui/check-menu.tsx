"use client"

import type { ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/utils/cn"

export type CheckMenuOption = { value: string; label: string; description?: string; disabled?: boolean }

/**
 * A menu of several independent items: each switched-on item has a check mark in the reserved left column (one of many
 * is a SelectMenu with a dot). The menu stays open while items are toggled; Esc, a click outside close it.
 */
export function CheckMenu({ label, values, options, onToggle, disabled, className, menuClassName, triggerContent }: {
  /** The trigger's accessible name. */
  label: string
  values: readonly string[]
  options: CheckMenuOption[]
  onToggle: (value: string, checked: boolean) => void
  disabled?: boolean
  className?: string
  menuClassName?: string
  /** What the closed trigger shows (default: the label with a chevron). */
  triggerContent?: ReactNode
}) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="outline" disabled={disabled} aria-label={label} className={cn("h-9 justify-between font-normal pointer-coarse:h-11", className)}>
        <span className="truncate">{triggerContent ?? label}</span>
        <ChevronDown aria-hidden="true" className="ml-2 h-4 w-4 shrink-0 opacity-60" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className={cn("min-w-[var(--radix-dropdown-menu-trigger-width)]", menuClassName)}>
      {options.map((option) => <DropdownMenuCheckboxItem key={option.value} checked={values.includes(option.value)} disabled={option.disabled}
        onSelect={(event) => event.preventDefault()} onCheckedChange={(checked) => onToggle(option.value, checked === true)}>
        {option.description
          ? <span className="flex min-w-0 flex-col gap-0.5 py-0.5"><span className="whitespace-nowrap font-medium">{option.label}</span><span className="whitespace-normal text-xs leading-snug text-muted-foreground">{option.description}</span></span>
          : <span className="whitespace-nowrap">{option.label}</span>}
      </DropdownMenuCheckboxItem>)}
    </DropdownMenuContent>
  </DropdownMenu>
}
