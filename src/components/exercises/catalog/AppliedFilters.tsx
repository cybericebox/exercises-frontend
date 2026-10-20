"use client"

import { X } from "lucide-react"
import { t } from "@/i18n/t"
import { DIFFICULTY_LEVELS, defaultFilters, type CatalogFilters, type StatusFilter } from "@/lib/catalogList"

const STATUS_KEYS: Record<StatusFilter, string> = { published: "admin.ex.filterStatusPublished", changed: "admin.ex.filterStatusChanged", draft: "admin.ex.filterStatusDraftOnly", archived: "admin.ex.filterStatusArchived" }

export function AppliedFilters({ filters, isAdmin, mobile, eventLabel, authorLabel, onChange, onClearSearch, onReset, active }: {
  filters: CatalogFilters
  isAdmin: boolean
  mobile: boolean
  eventLabel: (id: string) => string | undefined
  authorLabel: (id: string) => string | undefined
  onChange: (patch: Partial<CatalogFilters>) => void
  onClearSearch: () => void
  onReset: () => void
  active: number
}) {
  const chips: { key: string; label: string; remove: () => void; search?: boolean }[] = []
  if (mobile && filters.search) chips.push({ key: "search", label: t("exercises.catalog.searchCondition", { value: filters.search }), remove: onClearSearch, search: true })
  if (filters.scope !== defaultFilters(isAdmin).scope) chips.push({ key: "scope", label: t("exercises.catalog.storageCondition", { value: t(`exercises.scope.${filters.scope || "all"}`) }), remove: () => onChange({ scope: defaultFilters(isAdmin).scope }) })
  for (const field of ["events", "statuses", "authors", "tags", "notTags"] as const) {
    for (const value of filters[field]) {
      const name = field === "events" ? eventLabel(value) ?? value : field === "authors" ? authorLabel(value) ?? value : field === "statuses" ? t(STATUS_KEYS[value as StatusFilter]) : value
      chips.push({ key: `${field}:${value}`, label: t(`exercises.catalog.condition.${field}`, { value: name }), remove: () => onChange({ [field]: filters[field].filter((entry) => entry !== value) }) })
    }
  }
  if (filters.infrastructure) chips.push({ key: "infra", label: t("exercises.catalog.condition.infrastructure", { value: t(filters.infrastructure === "yes" ? "exercises.filter.infraYes" : "exercises.filter.infraNo") }), remove: () => onChange({ infrastructure: "" }) })
  if (filters.difficultyMin !== null || filters.difficultyMax !== null) {
    const level = (value: number | null) => value === null ? t("exercises.filter.difficulty.any") : t(`admin.ex.difficulty.${DIFFICULTY_LEVELS[value - 1]}`)
    chips.push({ key: "difficulty", label: t("exercises.catalog.condition.difficulty", { min: level(filters.difficultyMin), max: level(filters.difficultyMax) }), remove: () => onChange({ difficultyMin: null, difficultyMax: null }) })
  }
  if (!chips.length) return null
  return <div className="catalog-applied" aria-label={t("exercises.catalog.applied")}>
    {chips.map((chip) => <span className="catalog-chip" key={chip.key}><span>{chip.label}</span><button type="button" className="catalog-icon" aria-label={chip.search ? t("exercises.catalog.removeSearch") : t("exercises.filter.remove", { value: chip.label })} onClick={chip.remove}><X aria-hidden="true" /></button></span>)}
    {active > 0 && <button type="button" className="catalog-reset" onClick={onReset}>{t("exercises.filter.reset")}</button>}
  </div>
}
