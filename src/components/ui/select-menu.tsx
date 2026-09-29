"use client"

import { ChevronDown } from "lucide-react"
import { cn } from "@/utils/cn"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu"

export interface SelectMenuOption {
  value: string
  label: string
  description?: string
  unavailable?: boolean
  disabled?: boolean
}

interface SelectMenuProps {
  value: string
  onChange: (value: string) => void
  options: SelectMenuOption[]
  disabled?: boolean
  placeholder?: string
  className?: string
  ariaLabel?: string
  compactChevron?: boolean
  triggerVariant?: "outline" | "default"
  menuClassName?: string
  portalled?: boolean
  modal?: boolean
  sideOffset?: number
}

// Generic custom single-select. A Radix DropdownMenu radio group under the hood
// (fully styled popup) — use where a native <select>'s default option list is
// undesirable. Option-agnostic: pass any {value,label}[].
export function SelectMenu({ value, onChange, options, disabled, placeholder, className, ariaLabel, compactChevron = false, triggerVariant = "outline", menuClassName, portalled = true, modal = true, sideOffset = 4 }: SelectMenuProps) {
  const selected = options.find((o) => o.value === value)
  return (
    <DropdownMenu modal={modal}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          aria-label={ariaLabel}
          variant={triggerVariant}
          disabled={disabled}
          className={cn("h-10 justify-between font-normal", className)}
        >
          <span className={cn("truncate", !selected && "text-placeholder", selected?.unavailable && "text-destructive")}>{selected ? selected.label : (placeholder ?? "")}</span>
          <ChevronDown className={cn(compactChevron ? "ml-1" : "ml-2", "h-4 w-4 shrink-0 opacity-60")} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" portalled={portalled} sideOffset={sideOffset} className={cn("min-w-[var(--radix-dropdown-menu-trigger-width)]", menuClassName)}>
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value} disabled={o.disabled} className={o.unavailable ? "text-destructive focus:text-destructive" : undefined}>
              {o.description ? <span className="flex min-w-0 flex-col gap-0.5 py-0.5">
                <span className="font-medium">{o.label}</span>
                <span className="whitespace-normal text-xs leading-snug text-muted-foreground">{o.description}</span>
              </span> : o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
