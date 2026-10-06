"use client"

import { useRef, type KeyboardEvent } from "react"
import { cn } from "@/utils/cn"

export interface SegmentedOption {
  value: string
  label: string
}

/**
 * Segmented radiogroup (DS `.ib-seg`): one tab stop on the checked option,
 * arrows / Home / End move the selection and the focus together.
 */
export function Segmented({ value, onChange, options, ariaLabel, className }: {
  value: string
  onChange: (value: string) => void
  options: SegmentedOption[]
  ariaLabel: string
  className?: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const checked = Math.max(0, options.findIndex((option) => option.value === value))

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = options.length - 1
    const next = event.key === "ArrowRight" || event.key === "ArrowDown" ? (index + 1) % options.length
      : event.key === "ArrowLeft" || event.key === "ArrowUp" ? (index - 1 + options.length) % options.length
      : event.key === "Home" ? 0
      : event.key === "End" ? last : null
    if (next === null) return
    event.preventDefault()
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  return <div role="radiogroup" aria-label={ariaLabel}
    className={cn("inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg border border-[var(--ib-line)] bg-[var(--ib-seg-bg,var(--ib-paper))] p-[3px]", className)}>
    {options.map((option, index) => {
      const on = index === checked
      return <button key={option.value} ref={(node) => { refs.current[index] = node }} type="button" role="radio" aria-checked={on}
        tabIndex={on ? 0 : -1} onClick={() => onChange(option.value)} onKeyDown={(event) => onKeyDown(event, index)}
        className={cn("inline-flex h-8 shrink-0 items-center rounded-md border border-transparent px-3 text-sm transition-colors",
          "focus-visible:outline-2 focus-visible:outline-[var(--ib-action)]",
          on ? "border-[var(--ib-line)] bg-[var(--ib-raised)] font-semibold text-[var(--ib-ink)]" : "text-[var(--ib-dim)] hover:text-[var(--ib-ink)]")}>
        {option.label}
      </button>
    })}
  </div>
}
