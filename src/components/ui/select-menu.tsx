"use client"

import { useId } from "react"
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
  id?: string
  "aria-labelledby"?: string
  "aria-describedby"?: string
  "aria-invalid"?: boolean
  "aria-required"?: boolean
}

// Generic custom single-select. A Radix DropdownMenu radio group under the hood
// (fully styled popup) — use where a native <select>'s default option list is
// undesirable. Option-agnostic: pass any {value,label}[].
export function SelectMenu({ value, onChange, options, disabled, placeholder, className, ariaLabel, compactChevron = false, triggerVariant = "outline", menuClassName, portalled = true, modal = true, sideOffset = 4, id, "aria-labelledby": labelledBy, "aria-describedby": describedBy, "aria-invalid": invalid, "aria-required": required }: SelectMenuProps) {
  const selected = options.find((o) => o.value === value)
  const valueId = useId()
  // The name stays the field label; the chosen option is announced as the description (an aria-label alone would hide it).
  const described = [describedBy, selected ? valueId : undefined].filter(Boolean).join(" ") || undefined
  return (
    <DropdownMenu modal={modal}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          id={id}
          aria-label={labelledBy ? undefined : ariaLabel}
          aria-labelledby={labelledBy}
          aria-describedby={described}
          aria-invalid={invalid}
          aria-required={required}
          variant={triggerVariant}
          disabled={disabled}
          className={cn("h-10 justify-between font-normal", className)}
        >
          <span id={valueId} className={cn("truncate", !selected && "text-placeholder", selected?.unavailable && "text-destructive")}>{selected ? selected.label : (placeholder ?? "")}</span>
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
