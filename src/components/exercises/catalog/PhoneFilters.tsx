"use client"

import { useCallback } from "react"
import { ArrowDown, ArrowUp } from "lucide-react"
import { listExerciseAuthors, type InfrastructureFilter, type ScopeFilter } from "@/api/exercises/catalog"
import type { EventOption } from "@/api/events/list"
import { t } from "@/i18n/t"
import { STATUS_FILTERS, type CatalogFilters, type StatusFilter } from "@/lib/catalogList"
import { DifficultyRange, FilterField, helpLines, scopeTabs } from "./CatalogFilterFields"
import { OptionsBlock, useLoadedOptions, type ChoiceOption } from "./FilterChip"
import { TagFilter } from "./TagFilter"

const SORT_FIELDS = ["updated", "name", "status", "author", "subtasks", "variants", "difficulty"]
const STATUS_LABEL_KEYS: Record<StatusFilter, string> = {
  published: "admin.ex.filterStatusPublished",
  changed: "admin.ex.filterStatusChanged",
  draft: "admin.ex.filterStatusDraftOnly",
  archived: "admin.ex.filterStatusArchived",
}
const AUTHOR_LIMIT = 50

/** A toggle chip of the phone sheet (44px on touch). */
function Chip({ on, onClick, children, label }: { on: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
  return <button type="button" className="catalog-sheet-chip" aria-pressed={on} aria-label={label} onClick={onClick}>{children}</button>
}

function Chips({ label, children }: { label: string; children: React.ReactNode }) {
  return <div role="group" aria-label={label} className="catalog-sheet-chips">{children}</div>
}

const toggle = <T,>(list: T[], value: T) => list.includes(value) ? list.filter((item) => item !== value) : [...list, value]

/**
 * The phone sheet's filters, as in the prototype: sort, place, status, author, events and infrastructure as toggle
 * chips, the tags as the +/− list, the difficulty range as two menus. Every change applies at once.
 */
export function PhoneFilters({ filters, isAdmin, eventOptions, authorLabel, onAuthorsLoaded, onChange, open }: {
  filters: CatalogFilters
  isAdmin: boolean
  eventOptions: EventOption[]
  authorLabel: (id: string) => string | undefined
  onAuthorsLoaded?: (options: ChoiceOption[]) => void
  onChange: (patch: Partial<CatalogFilters>) => void
  /** The sheet is open: the authors are asked only then. */
  open: boolean
}) {
  const loadAuthors = useCallback(async (query: string): Promise<ChoiceOption[]> => {
    const options = (await listExerciseAuthors(query, AUTHOR_LIMIT)).map(({ ID, Name, Count }) => ({ value: ID, label: Name || t("exercises.filter.author.noName"), meta: String(Count) }))
    onAuthorsLoaded?.(options)
    return options
  }, [onAuthorsLoaded])
  const authors = useLoadedOptions(loadAuthors, open)
  const statuses = STATUS_FILTERS.filter((status) => status !== "archived" || isAdmin)
  const eventsMode = filters.scope || "all"
  return <div className="catalog-sheet-fields">
    <FilterField label={t("exercises.catalog.sortBy")}>
      <Chips label={t("exercises.catalog.sortBy")}>
        {SORT_FIELDS.map((field) => {
          const on = filters.sortBy === field
          const Icon = filters.sortDir === "asc" ? ArrowUp : ArrowDown
          return <Chip key={field} on={on}
            label={on ? t("exercises.catalog.sortChip", { field: t(`admin.ex.col.${field}`), direction: t(filters.sortDir === "asc" ? "exercises.catalog.sortAsc" : "exercises.catalog.sortDesc") }) : undefined}
            onClick={() => onChange(on ? { sortDir: filters.sortDir === "asc" ? "desc" : "asc" } : { sortBy: field, sortDir: field === "updated" ? "desc" : "asc" })}>
            {t(`admin.ex.col.${field}`)}{on && <Icon aria-hidden="true" className="h-4 w-4" />}
          </Chip>
        })}
      </Chips>
    </FilterField>
    <FilterField label={t("exercises.catalog.storage")} help={scopeTabs(isAdmin).map((value) => t("exercises.help.scope.line", { name: t(`exercises.scope.${value || "all"}`), text: t(`exercises.help.scope.${value || "all"}`) }))}>
      <Chips label={t("exercises.catalog.storage")}>
        {scopeTabs(isAdmin).map((value) => <Chip key={value || "all"} on={filters.scope === value} onClick={() => onChange({ scope: value as ScopeFilter })}>{t(`exercises.scope.${value || "all"}`)}</Chip>)}
      </Chips>
    </FilterField>
    <FilterField label={t("admin.ex.col.status")} help={[...helpLines("exercises.help.statusFilter", ["published", "changed", "draftOnly"]), t("exercises.help.status.several")]}>
      <Chips label={t("admin.ex.col.status")}>
        {statuses.map((status) => <Chip key={status} on={filters.statuses.includes(status)} onClick={() => onChange({ statuses: toggle(filters.statuses, status) })}>{t(STATUS_LABEL_KEYS[status])}</Chip>)}
      </Chips>
    </FilterField>
    <FilterField label={t("exercises.filter.author.label")} help={helpLines("exercises.help.author", ["who", "several"])}>
      <div className="catalog-sheet-authors"><OptionsBlock loaded={authors.loaded} emptyMessage={t("exercises.filter.author.empty")} errorMessage={t("exercises.filter.author.loadError")} onRetry={authors.retry}>
        {(items) => <Chips label={t("exercises.filter.author.label")}>
          {[...filters.authors.filter((id) => !items.some((item) => item.value === id)).map((id) => ({ value: id, label: authorLabel(id) ?? id })), ...items]
            .map((author) => <Chip key={author.value} on={filters.authors.includes(author.value)} onClick={() => onChange({ authors: toggle(filters.authors, author.value) })}>{author.label}</Chip>)}
        </Chips>}
      </OptionsBlock></div>
    </FilterField>
    {(eventOptions.length > 0 || filters.events.length > 0) && <FilterField label={t(`exercises.filter.events.${eventsMode}`)} help={[t(`exercises.help.events.${eventsMode}`)]}>
      <Chips label={t(`exercises.filter.events.${eventsMode}`)}>
        {eventOptions.map((event) => <Chip key={event.ID} on={filters.events.includes(event.ID)} onClick={() => onChange({ events: toggle(filters.events, event.ID) })}>{event.Name || event.Tag || event.ID}</Chip>)}
      </Chips>
    </FilterField>}
    <FilterField label={t("exercises.filter.infra")} help={helpLines("exercises.help.infra", ["needed", "notNeeded"])}>
      <Chips label={t("exercises.filter.infra")}>
        {([["", "exercises.filter.infraAll"], ["yes", "exercises.filter.infraYes"], ["no", "exercises.filter.infraNo"]] as const).map(([value, key]) =>
          <Chip key={value || "all"} on={filters.infrastructure === value} onClick={() => onChange({ infrastructure: value as InfrastructureFilter })}>{t(key)}</Chip>)}
      </Chips>
    </FilterField>
    <FilterField label={t("exercises.filter.tags.label")} help={helpLines("exercises.help.tags", ["cycle", "match", "existing"])}>
      <TagFilter tags={filters.tags} mode={filters.tagMode} notTags={filters.notTags} active={open} searchAutoFocus={false} onChange={onChange} />
    </FilterField>
    <FilterField label={t("exercises.filter.difficulty.label")} help={helpLines("exercises.help.difficulty", ["average", "none"])}>
      <DifficultyRange min={filters.difficultyMin} max={filters.difficultyMax} onChange={(difficultyMin, difficultyMax) => onChange({ difficultyMin, difficultyMax })} />
    </FilterField>
  </div>
}
