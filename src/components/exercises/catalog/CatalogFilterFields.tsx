"use client"

import { useId } from "react"
import type { ScopeFilter } from "@/api/exercises/catalog"
import { FieldHelp } from "@/components/ui/field-help"
import { SelectMenu } from "@/components/ui/select-menu"
import { t } from "@/i18n/t"
import { DIFFICULTY_LEVELS } from "@/lib/catalogList"
import { cn } from "@/utils/cn"

/** Label row of a filter, with a help icon; the label names the control through `htmlFor`-less aria (the control carries its own name). */
export function FilterField({ label, help, helpContent, children, className }: { label: string; help?: string[]; helpContent?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="flex min-h-6 items-center gap-1 text-[length:var(--ib-fs-13)] text-muted-foreground">{label}{help && <FieldHelp lines={help} content={helpContent} />}</span>
      {children}
    </div>
  )
}

/** One i18n key per help line: `${prefix}.${name}`. */
export function helpLines(prefix: string, names: string[]): string[] {
  return names.map((name) => t(`${prefix}.${name}`))
}

/** The scope tabs: «Усі» is admin-only, broadest to narrowest. */
export function scopeTabs(isAdmin: boolean): ScopeFilter[] {
  return [...(isAdmin ? [""] as ScopeFilter[] : []), "catalog", "event"]
}

/** Average difficulty range: two level menus, «Будь-яка» = no bound; a bound never passes the other one. */
export function DifficultyRange({ min, max, onChange }: { min: number | null; max: number | null; onChange: (min: number | null, max: number | null) => void }) {
  const fromId = useId()
  const toId = useId()
  const options = (disabled: (level: number) => boolean) => [
    { value: "", label: t("exercises.filter.difficulty.any") },
    ...DIFFICULTY_LEVELS.map((name, index) => ({ value: String(index + 1), label: t(`admin.ex.difficulty.${name}`), disabled: disabled(index + 1) })),
  ]
  const parse = (value: string) => (value ? Number(value) : null)
  return (
    <div className="grid min-w-0 grid-cols-2 gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <span id={fromId} className="shrink-0 text-xs text-muted-foreground">{t("exercises.filter.difficulty.from")}</span>
        <SelectMenu value={min === null ? "" : String(min)} onChange={(value) => onChange(parse(value), max)}
          ariaLabel={t("exercises.filter.difficulty.fromLabel")} options={options((level) => max !== null && level > max)}
          className="min-w-0 flex-1 text-sm" aria-describedby={fromId} />
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        <span id={toId} className="shrink-0 text-xs text-muted-foreground">{t("exercises.filter.difficulty.to")}</span>
        <SelectMenu value={max === null ? "" : String(max)} onChange={(value) => onChange(min, parse(value))}
          ariaLabel={t("exercises.filter.difficulty.toLabel")} options={options((level) => min !== null && level < min)}
          className="min-w-0 flex-1 text-sm" aria-describedby={toId} />
      </div>
    </div>
  )
}
