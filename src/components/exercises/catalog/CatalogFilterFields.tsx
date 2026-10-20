"use client"

import { useId } from "react"
import { listExerciseAuthors, listExerciseTags, type InfrastructureFilter, type ScopeFilter } from "@/api/exercises/catalog"
import type { EventOption } from "@/api/events/list"
import { FilterCombobox, type FilterOption } from "@/components/exercises/catalog/FilterCombobox"
import { FieldHelp } from "@/components/ui/field-help"
import { Segmented } from "@/components/ui/segmented"
import { SelectMenu } from "@/components/ui/select-menu"
import { t } from "@/i18n/t"
import { tRich } from "@/i18n/tRich"
import { DIFFICULTY_LEVELS, STATUS_FILTERS, type CatalogFilters, type StatusFilter } from "@/lib/catalogList"
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

const STATUS_LABEL_KEYS: Record<StatusFilter, string> = {
  published: "admin.ex.filterStatusPublished",
  changed: "admin.ex.filterStatusChanged",
  draft: "admin.ex.filterStatusDraftOnly",
  archived: "admin.ex.filterStatusArchived",
}

/** An event's name in the filter (its tag, then its id, when it has none). */
function eventLabel(event: EventOption): string {
  return event.Name || event.Tag || event.ID
}

const TAG_LIMIT = 50
const AUTHOR_LIMIT = 50

async function loadTags(query: string): Promise<FilterOption[]> {
  return (await listExerciseTags(query, TAG_LIMIT)).map(({ Tag, Count }) => ({ value: Tag, label: Tag, meta: String(Count) }))
}

async function loadAuthors(query: string): Promise<FilterOption[]> {
  return (await listExerciseAuthors(query, AUTHOR_LIMIT)).map(({ ID, Name, Count }) => ({ value: ID, label: Name || t("exercises.filter.author.noName"), meta: String(Count) }))
}

/** The scope tabs: «Усі» is admin-only, broadest to narrowest. */
export function scopeTabs(isAdmin: boolean): ScopeFilter[] {
  return [...(isAdmin ? [""] as ScopeFilter[] : []), "catalog", "event"]
}

/** «Область»: catalog and event tasks, or both (admins). An all-or-one toggle, so not a multi-select. */
export function ScopeFilterField({ filters, isAdmin, onChange, className }: { filters: CatalogFilters; isAdmin: boolean; onChange: (scope: ScopeFilter) => void; className?: string }) {
  const tabs = scopeTabs(isAdmin)
  const scopeHelpLine = (value: ScopeFilter) => t("exercises.help.scope.line", { name: t(`exercises.scope.${value || "all"}`), text: t(`exercises.help.scope.${value || "all"}`) })
  return (
    <FilterField label={t("exercises.catalog.storage")} help={tabs.map((value) => scopeHelpLine(value))} className={className}
      helpContent={<ul className="space-y-1">{tabs.map((value) => (
        <li key={value || "all"}>{tRich("exercises.help.scope.line", { name: <strong className="font-semibold">{t(`exercises.scope.${value || "all"}`)}</strong>, text: t(`exercises.help.scope.${value || "all"}`) })}</li>
      ))}</ul>}>
      <Segmented value={filters.scope} onChange={(value) => onChange(value as ScopeFilter)} ariaLabel={t("exercises.catalog.storage")}
        options={tabs.map((value) => ({ value, label: t(`exercises.scope.${value || "all"}`) }))} />
    </FilterField>
  )
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
          className="h-10 min-w-0 flex-1 text-sm" aria-describedby={fromId} />
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        <span id={toId} className="shrink-0 text-xs text-muted-foreground">{t("exercises.filter.difficulty.to")}</span>
        <SelectMenu value={max === null ? "" : String(max)} onChange={(value) => onChange(min, parse(value))}
          ariaLabel={t("exercises.filter.difficulty.toLabel")} options={options((level) => min !== null && level < min)}
          className="h-10 min-w-0 flex-1 text-sm" aria-describedby={toId} />
      </div>
    </div>
  )
}

/**
 * Every catalog filter but the scope and the search: events, statuses, authors, the average difficulty range,
 * infrastructure, tags (так / ні in one field). Multi-selects share FilterCombobox; the range and the binary
 * infrastructure filter are menus. Laid out by the caller (a grid on wide screens, a column in the phone panel).
 */
export function CatalogFilterFields({ filters, isAdmin, eventOptions, authorLabel, onAuthorsLoaded, onChange, className, rangeClassName, tagsClassName }: {
  filters: CatalogFilters
  isAdmin: boolean
  eventOptions: EventOption[]
  /** The names of chosen authors that are not listed yet (a shared link). */
  authorLabel: (id: string) => string | undefined
  onAuthorsLoaded?: (options: FilterOption[]) => void
  onChange: (patch: Partial<CatalogFilters>) => void
  className?: string
  /** The difficulty range field (two menus: wider in a grid). */
  rangeClassName?: string
  /** The tags field (many chips: wider in a grid). */
  tagsClassName?: string
}) {
  // The events filter means different things per tab (server: owned, available, or both).
  const eventsMode = filters.scope || "all"
  const statuses = STATUS_FILTERS.filter((status) => status !== "archived" || isAdmin)
  const events: FilterOption[] = eventOptions.map((event) => ({ value: event.ID, label: eventLabel(event), meta: event.Name && event.Tag ? event.Tag : undefined }))
  return (
    <div className={className}>
      <fieldset className="catalog-filter-group"><legend>{t("exercises.catalog.group.ownership")}</legend>
      {(eventOptions.length > 0 || filters.events.length > 0) && (
        <FilterField label={t(`exercises.filter.events.${eventsMode}`)} help={[t(`exercises.help.events.${eventsMode}`)]}>
          <FilterCombobox label={t(`exercises.filter.events.${eventsMode}`)} placeholder={t("exercises.filter.events.placeholder")}
            value={filters.events} onChange={(value) => onChange({ events: value })} options={events}
            emptyMessage={t("exercises.access.noEvents")} />
        </FilterField>
      )}
      <FilterField label={t("exercises.filter.author.label")} help={helpLines("exercises.help.author", ["who", "several"])}>
        <FilterCombobox label={t("exercises.filter.author.label")} placeholder={t("exercises.filter.author.placeholder")}
          value={filters.authors} onChange={(value) => onChange({ authors: value })} load={loadAuthors} labelFor={authorLabel} onOptionsLoaded={onAuthorsLoaded}
          emptyMessage={t("exercises.filter.author.empty")} errorMessage={t("exercises.filter.author.loadError")} />
      </FilterField>
      </fieldset>
      <fieldset className="catalog-filter-group"><legend>{t("exercises.catalog.group.state")}</legend>
      <FilterField label={t("admin.ex.col.status")} help={[...helpLines("exercises.help.statusFilter", ["published", "changed", "draftOnly"]), t("exercises.help.status.several")]}>
        <FilterCombobox label={t("admin.ex.col.status")} placeholder={t("exercises.filter.status.placeholder")}
          value={filters.statuses} onChange={(value) => onChange({ statuses: value as StatusFilter[] })}
          options={statuses.map((status) => ({ value: status, label: t(STATUS_LABEL_KEYS[status]) }))}
          emptyMessage={t("exercises.filter.status.empty")} />
      </FilterField>
      <FilterField label={t("exercises.filter.infra")} help={helpLines("exercises.help.infra", ["needed", "notNeeded"])}>
        <SelectMenu value={filters.infrastructure} onChange={(value) => onChange({ infrastructure: value as InfrastructureFilter })}
          options={[
            { value: "", label: t("exercises.filter.infraAll") },
            { value: "yes", label: t("exercises.filter.infraYes") },
            { value: "no", label: t("exercises.filter.infraNo") },
          ]}
          ariaLabel={t("exercises.filter.infra")} className="h-10 w-full text-sm" />
      </FilterField>
      </fieldset>
      <fieldset className="catalog-filter-group"><legend>{t("exercises.catalog.group.content")}</legend>
      <FilterField label={t("exercises.filter.tags.label")} help={helpLines("exercises.help.tags", ["cycle", "match", "existing"])} className={tagsClassName}>
        <FilterCombobox label={t("exercises.filter.tags.label")} placeholder={t("admin.ex.filterTags.placeholder")}
          value={filters.tags} onChange={(value) => onChange({ tags: value })}
          excluded={filters.notTags} onExcludedChange={(notTags) => onChange({ notTags })} load={loadTags}
          emptyMessage={t("admin.ex.filterTags.empty")} errorMessage={t("admin.ex.filterTags.loadError")} />
      </FilterField>
      <FilterField label={t("exercises.filter.difficulty.label")} help={helpLines("exercises.help.difficulty", ["average", "none"])} className={rangeClassName}>
        <DifficultyRange min={filters.difficultyMin} max={filters.difficultyMax} onChange={(difficultyMin, difficultyMax) => onChange({ difficultyMin, difficultyMax })} />
      </FilterField>
      </fieldset>
    </div>
  )
}
