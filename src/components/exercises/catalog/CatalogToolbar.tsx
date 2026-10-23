"use client"

import { useCallback, useState, type ReactNode } from "react"
import { MoreHorizontal, Plus, Search, SlidersHorizontal, Upload, X } from "lucide-react"
import { listExerciseAuthors, type InfrastructureFilter, type ScopeFilter } from "@/api/exercises/catalog"
import type { EventOption } from "@/api/events/list"
import { Button } from "@/components/ui/button"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { GuideLink } from "@/components/exercises/GuideLink"
import { guideHref } from "@/content/guide/registry"
import { t } from "@/i18n/t"
import { DIFFICULTY_LEVELS, MAX_AUTHORS, STATUS_FILTERS, defaultFilters, type CatalogFilters, type StatusFilter } from "@/lib/catalogList"
import type { ColumnSetting } from "@/lib/catalogColumns"
import { ChoiceList, FilterChip, OptionSearch, OptionsBlock, useLoadedOptions, type ChoiceOption } from "./FilterChip"
import { TagFilter, tagSummary } from "./TagFilter"
import { ColumnsMenu } from "./ColumnsMenu"
import { DifficultyRange, scopeTabs } from "./CatalogFilterFields"

/** Filters that are not on the bar until they are added (or set by a shared link). */
export const EXTRA_FILTERS = ["difficulty", "infrastructure", "events", "scope"] as const
export type ExtraFilter = (typeof EXTRA_FILTERS)[number]

export const STATUS_LABEL_KEYS: Record<StatusFilter, string> = {
  published: "exercises.status.short.published",
  changed: "exercises.status.short.changed",
  draft: "exercises.status.short.draft",
  archived: "exercises.status.short.archived",
}

const INFRA_KEYS: Record<Exclude<InfrastructureFilter, "">, string> = { yes: "exercises.filter.infraYes", no: "exercises.filter.infraNo" }

/** Whether an extra filter differs from its default (then its chip stays on the bar). */
export function extraActive(key: ExtraFilter, filters: CatalogFilters, isAdmin: boolean): boolean {
  if (key === "difficulty") return filters.difficultyMin !== null || filters.difficultyMax !== null
  if (key === "infrastructure") return Boolean(filters.infrastructure)
  if (key === "events") return filters.events.length > 0
  return filters.scope !== defaultFilters(isAdmin).scope
}

const AUTHOR_LIMIT = 50

export type ToolbarProps = {
  filters: CatalogFilters
  isAdmin: boolean
  search: string
  onSearch: (value: string) => void
  onClearSearch: () => void
  eventOptions: EventOption[]
  eventName: (id: string) => string | undefined
  authorLabel: (id: string) => string | undefined
  onAuthorsLoaded: (options: ChoiceOption[]) => void
  onChange: (patch: Partial<CatalogFilters>) => void
  columns: ColumnSetting[]
  onColumns: (columns: ColumnSetting[]) => void
  /** The layout is the default (no «Скинути» in the columns menu). */
  columnsDefault: boolean
  /** Default order, visibility and widths. */
  onColumnsReset: () => void
  canImport: boolean
  canWrite: boolean
  onImport: () => void
  onCreate: () => void
  /** Phone: how many filters are set (the badge on the filter button). */
  active: number
  onOpenSheet: () => void
  sheetOpen: boolean
  mobile: boolean
}

/**
 * The one row over the catalog table: search, a chip per filter (status, author, tags; more through «Фільтр»),
 * then the columns, import, guide and create actions as icons. On a phone: search, filters (a sheet), more, create.
 */
export function CatalogToolbar(props: ToolbarProps) {
  return props.mobile ? <PhoneToolbar {...props} /> : <DesktopToolbar {...props} />
}

function SearchField({ value, onChange, onClear, className }: { value: string; onChange: (value: string) => void; onClear: () => void; className?: string }) {
  return <div className={`catalog-search ${className ?? ""}`}>
    <Search aria-hidden="true" />
    <input id="catalog-search" type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={t("admin.ex.search")} aria-label={t("admin.ex.search")} />
    {value && <HoverTooltip text={t("exercises.catalog.clearSearch")}>
      <button type="button" className="catalog-search-x" aria-label={t("exercises.catalog.clearSearch")} onClick={onClear}><X aria-hidden="true" /></button>
    </HoverTooltip>}
  </div>
}

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return <HoverTooltip text={label}><button type="button" className="catalog-tool" aria-label={label} onClick={onClick}>{children}</button></HoverTooltip>
}

function DesktopToolbar({ filters, isAdmin, search, onSearch, onClearSearch, eventOptions, eventName, authorLabel, onAuthorsLoaded, onChange, columns, onColumns, columnsDefault, onColumnsReset, canImport, canWrite, onImport, onCreate }: ToolbarProps) {
  const [added, setAdded] = useState<ExtraFilter[]>([])
  const [openChip, setOpenChip] = useState<string | null>(null)
  const chipOpen = (id: string) => ({ open: openChip === id, onOpenChange: (open: boolean) => setOpenChip(open ? id : null) })
  const shown = EXTRA_FILTERS.filter((key) => added.includes(key) || extraActive(key, filters, isAdmin))
  const addable = EXTRA_FILTERS.filter((key) => !shown.includes(key) && (key !== "events" || eventOptions.length > 0))
  const removeExtra = (key: ExtraFilter, patch: Partial<CatalogFilters>) => { setAdded((list) => list.filter((item) => item !== key)); onChange(patch) }
  const statuses = STATUS_FILTERS.filter((status) => status !== "archived" || isAdmin)
  const levelName = (level: number | null) => level === null ? t("exercises.filter.difficulty.any") : t(`admin.ex.difficulty.${DIFFICULTY_LEVELS[level - 1]}`)
  const defaultScope = defaultFilters(isAdmin).scope
  const extraChip = (key: ExtraFilter) => {
    if (key === "difficulty") return <FilterChip key={key} label={t("exercises.filter.difficulty.label")} {...chipOpen(key)} contentClassName="w-96 p-3"
      value={extraActive(key, filters, isAdmin) ? t("exercises.catalog.condition.difficultyRange", { min: levelName(filters.difficultyMin), max: levelName(filters.difficultyMax) }) : ""}
      onClear={() => removeExtra(key, { difficultyMin: null, difficultyMax: null })}>
      <DifficultyRange min={filters.difficultyMin} max={filters.difficultyMax} onChange={(difficultyMin, difficultyMax) => onChange({ difficultyMin, difficultyMax })} />
    </FilterChip>
    if (key === "infrastructure") return <FilterChip key={key} label={t("exercises.filter.infra")} {...chipOpen(key)}
      value={filters.infrastructure ? t(INFRA_KEYS[filters.infrastructure]) : ""} onClear={() => removeExtra(key, { infrastructure: "" })}>
      <RadioList label={t("exercises.filter.infra")} value={filters.infrastructure} onChange={(value) => onChange({ infrastructure: value as InfrastructureFilter })}
        options={[{ value: "", label: t("exercises.filter.infraAll") }, { value: "yes", label: t(INFRA_KEYS.yes) }, { value: "no", label: t(INFRA_KEYS.no) }]} />
    </FilterChip>
    if (key === "events") return <FilterChip key={key} label={t(`exercises.filter.events.${filters.scope || "all"}`)} {...chipOpen(key)} contentClassName="w-80 p-1.5"
      value={filters.events.map((id) => eventName(id) ?? id).join(", ")} onClear={() => removeExtra(key, { events: [] })}>
      <EventOptions value={filters.events} options={eventOptions} onChange={(events) => onChange({ events })} />
    </FilterChip>
    return <FilterChip key={key} label={t("exercises.catalog.storage")} {...chipOpen(key)}
      value={filters.scope !== defaultScope ? t(`exercises.scope.${filters.scope || "all"}`) : ""} onClear={() => removeExtra(key, { scope: defaultScope })}>
      <RadioList label={t("exercises.catalog.storage")} value={filters.scope} onChange={(value) => onChange({ scope: value as ScopeFilter })}
        options={scopeTabs(isAdmin).map((value) => ({ value, label: t(`exercises.scope.${value || "all"}`) }))} />
    </FilterChip>
  }
  return <div className="catalog-toolbar">
    <div className="catalog-chips">
    <SearchField value={search} onChange={onSearch} onClear={onClearSearch} className="catalog-search-desk" />
    <FilterChip label={t("admin.ex.col.status")} {...chipOpen("status")}
      value={filters.statuses.map((status) => t(STATUS_LABEL_KEYS[status])).join(", ")} onClear={() => onChange({ statuses: [] })}>
      <ChoiceList label={t("admin.ex.col.status")} value={filters.statuses} onChange={(value) => onChange({ statuses: value as StatusFilter[] })}
        options={statuses.map((status) => ({ value: status, label: t(STATUS_LABEL_KEYS[status]) }))} />
    </FilterChip>
    <FilterChip label={t("exercises.filter.author.label")} {...chipOpen("author")} contentClassName="w-72 p-1.5"
      value={filters.authors.map((id) => authorLabel(id) ?? "…").join(", ")} onClear={() => onChange({ authors: [] })}>
      <AuthorOptions value={filters.authors} active={openChip === "author"} labelFor={authorLabel} onLoaded={onAuthorsLoaded} onChange={(authors) => onChange({ authors })} />
    </FilterChip>
    <FilterChip label={t("exercises.filter.tags.label")} {...chipOpen("tags")} contentClassName="w-96 p-1.5"
      value={tagSummary(filters.tags, filters.tagMode, filters.notTags)} onClear={() => onChange({ tags: [], notTags: [] })}>
      <TagFilter tags={filters.tags} mode={filters.tagMode} notTags={filters.notTags} active={openChip === "tags"} onChange={onChange} />
    </FilterChip>
    {shown.map(extraChip)}
    {addable.length > 0 && <Popover {...chipOpen("add")}>
      <PopoverTrigger asChild><button type="button" className="catalog-fchip catalog-fchip-add"><Plus aria-hidden="true" />{t("exercises.filter.add")}</button></PopoverTrigger>
      <PopoverContent className="w-60 p-1.5">
        <p className="px-2 pb-1 pt-1 text-xs text-muted-foreground">{t("exercises.filter.addTitle")}</p>
        {addable.map((key) => <button key={key} type="button" className="catalog-opt w-full text-left"
          onClick={() => { setAdded((list) => [...list, key]); setOpenChip(null); requestAnimationFrame(() => setOpenChip(key)) }}>
          {key === "difficulty" ? t("exercises.filter.difficulty.label") : key === "infrastructure" ? t("exercises.filter.infra") : key === "events" ? t(`exercises.filter.events.${filters.scope || "all"}`) : t("exercises.catalog.storage")}
        </button>)}
      </PopoverContent>
    </Popover>}
    </div>
    <ColumnsMenu columns={columns} onChange={onColumns} isDefault={columnsDefault} onReset={onColumnsReset} />
    {canImport && <ToolButton label={t("exercises.catalog.importTip")} onClick={onImport}><Upload aria-hidden="true" /></ToolButton>}
    <GuideLink topic="zavdannia" variant="tool" />
    {canWrite && <Button type="button" onClick={onCreate}><Plus aria-hidden="true" className="mr-1.5 h-4 w-4" />{t("exercises.catalog.create")}</Button>}
  </div>
}

function PhoneToolbar({ search, onSearch, onClearSearch, canImport, canWrite, onImport, onCreate, active, onOpenSheet, sheetOpen }: ToolbarProps) {
  const filtersLabel = active ? t("exercises.filter.openCount", { count: active }) : t("exercises.filter.open")
  return <div className="catalog-toolbar">
    <SearchField value={search} onChange={onSearch} onClear={onClearSearch} className="min-w-0 flex-1" />
    <HoverTooltip text={filtersLabel}>
      <button type="button" className="catalog-tool relative" aria-label={filtersLabel} aria-haspopup="dialog" aria-expanded={sheetOpen} onClick={onOpenSheet}>
        <SlidersHorizontal aria-hidden="true" />{active > 0 && <span aria-hidden="true" className="catalog-badge">{active}</span>}
      </button>
    </HoverTooltip>
    <DropdownMenu>
      <HoverTooltip text={t("exercises.catalog.more")}>
        <DropdownMenuTrigger asChild><button type="button" className="catalog-tool" aria-label={t("exercises.catalog.more")}><MoreHorizontal aria-hidden="true" /></button></DropdownMenuTrigger>
      </HoverTooltip>
      <DropdownMenuContent align="end">
        {canImport && <DropdownMenuItem onSelect={onImport}><Upload aria-hidden="true" className="mr-2 h-4 w-4" />{t("exercises.catalog.importTip")}</DropdownMenuItem>}
        <DropdownMenuItem asChild><a href={guideHref("zavdannia")}>{t("admin.exGuide.zavdannia")}</a></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    {canWrite && <HoverTooltip text={t("exercises.catalog.create")}>
      <button type="button" className="catalog-tool catalog-tool-primary" aria-label={t("exercises.catalog.create")} onClick={onCreate}><Plus aria-hidden="true" /></button>
    </HoverTooltip>}
  </div>
}

/** One of several (a radio list): infrastructure, where the task is kept. */
function RadioList({ label, value, options, onChange }: { label: string; value: string; options: ChoiceOption[]; onChange: (value: string) => void }) {
  return <div role="radiogroup" aria-label={label} className="flex flex-col">
    {options.map((option) => <label key={option.value || "all"} className="catalog-opt">
      <input type="radio" name={label} checked={value === option.value} onChange={() => onChange(option.value)} />
      <span className="min-w-0 flex-1">{option.label}</span>
    </label>)}
  </div>
}

function AuthorOptions({ value, active, labelFor, onLoaded, onChange }: { value: string[]; active: boolean; labelFor: (id: string) => string | undefined; onLoaded: (options: ChoiceOption[]) => void; onChange: (value: string[]) => void }) {
  const load = useCallback(async (query: string) => {
    const items = (await listExerciseAuthors(query, AUTHOR_LIMIT)).map(({ ID, Name, Count }) => ({ value: ID, label: Name || t("exercises.filter.author.noName"), meta: String(Count) }))
    onLoaded(items)
    return items
  }, [onLoaded])
  const { query, setQuery, loaded, retry } = useLoadedOptions(load, active)
  const chosen = (items: ChoiceOption[]) => [...value.filter((id) => !items.some((item) => item.value === id)).map((id) => ({ value: id, label: labelFor(id) ?? id })), ...items]
  return <div className="flex flex-col gap-1.5">
    <OptionSearch value={query} onChange={setQuery} placeholder={t("exercises.filter.author.placeholder")} />
    <OptionsBlock loaded={loaded} emptyMessage={t("exercises.filter.author.empty")} errorMessage={t("exercises.filter.author.loadError")} onRetry={retry}>
      {(items) => <ChoiceList label={t("exercises.filter.author.label")} value={value} onChange={(next) => onChange(next.slice(0, MAX_AUTHORS))} options={chosen(items)} />}
    </OptionsBlock>
  </div>
}

function EventOptions({ value, options, onChange }: { value: string[]; options: EventOption[]; onChange: (value: string[]) => void }) {
  const [query, setQuery] = useState("")
  const text = query.trim().toLowerCase()
  const list = options.map((event) => ({ value: event.ID, label: event.Name || event.Tag || event.ID, meta: event.Name && event.Tag ? event.Tag : undefined }))
    .filter((option) => value.includes(option.value) || !text || option.label.toLowerCase().includes(text) || option.meta?.toLowerCase().includes(text))
  return <div className="flex flex-col gap-1.5">
    <OptionSearch value={query} onChange={setQuery} placeholder={t("exercises.filter.events.placeholder")} />
    <OptionsBlock loaded={{ query: text, items: list, failed: null }} emptyMessage={t("exercises.access.noEvents")} errorMessage="" onRetry={() => undefined}>
      {(items) => <ChoiceList label={t("exercises.filter.event")} value={value} onChange={onChange} options={items} />}
    </OptionsBlock>
  </div>
}
