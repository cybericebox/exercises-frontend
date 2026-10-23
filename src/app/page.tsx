"use client"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, SlidersHorizontal, Upload, X } from "lucide-react"
import { t } from "@/i18n/t"
import { useRole } from "@/lib/useRole"
import { listExerciseAuthors, listExercisesPage, type Exercise, type ExerciseListItem } from "@/api/exercises/catalog"
import { listEventOptions, type EventOption } from "@/api/events/list"
import { useExerciseAccess } from "@/components/shell/AccessContext"
import { accessFromRbac, canCreateExercise, ownerOptions, writableEvents } from "@/lib/exerciseRights"
import {
  clearedFilters, countActiveFilters, defaultFilters, filtersFromSearch, filtersToSearch, hasActiveFilters, loadCatalogPage, MAX_AUTHORS, mergeCardIntoRow, type CatalogFilters,
} from "@/lib/catalogList"
import { CatalogFilterFields, ScopeFilterField } from "@/components/exercises/catalog/CatalogFilterFields"
import { FiltersSheet } from "@/components/exercises/catalog/FiltersSheet"
import { CatalogTable } from "@/components/exercises/catalog/CatalogTable"
import { AppliedFilters } from "@/components/exercises/catalog/AppliedFilters"
import { useMediaQuery } from "@/components/shell/useMediaQuery"
import type { FilterOption } from "@/components/exercises/catalog/FilterCombobox"
import "@/styles/catalog.css"
import { BulkActions } from "@/components/exercises/catalog/BulkActions"
import { EXPORT_LIMIT } from "@/api/exercises/archive"
import { ExportDialog } from "@/components/exercises/ExportDialog"
import { ImportDialog } from "@/components/exercises/ImportDialog"
import { onImportsDone } from "@/lib/importJobs"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { LoadingArea } from "@/components/ui/spinner"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadError } from "@/components/ui/load-error"
import { TablePagination } from "@/components/ui/table-pagination"
/** Filters from the URL (static export: read once on mount, no Suspense needed). */
function initialFilters(isAdmin: boolean): CatalogFilters {
  return typeof window === "undefined" ? defaultFilters(isAdmin) : filtersFromSearch(window.location.search, isAdmin)
}

export default function Page() {
  const router = useRouter()
  const originActive = useRef(true)
  useEffect(() => { originActive.current = true; return () => { originActive.current = false } }, [])
  const [sheetOpen, setSheetOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const mobile = useMediaQuery("(max-width: 639px)", false)
  const [rows, setRows] = useState<ExerciseListItem[]>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ cause: unknown } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  // The selected rows by ID (the selection spans pages; the bulk actions read the rights of each).
  const [selected, setSelected] = useState<Map<string, ExerciseListItem>>(() => new Map())
  const [exportOpen, setExportOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  // Set when the dialog is reopened on a background import from the indicator.
  const [importJobId, setImportJobId] = useState<string | undefined>()
  const tableScrollRef = useRef<HTMLDivElement>(null)

  const { can, me } = useRole()
  const { access: loadedAccess } = useExerciseAccess()
  const access = loadedAccess ?? accessFromRbac(can)
  const isAdmin = access.IsAdmin
  const [filters, setFilters] = useState<CatalogFilters>(() => initialFilters(isAdmin))
  const [search, setSearch] = useState(filters.search)
  const [adminEvents, setAdminEvents] = useState<EventOption[]>([])
  // Names of the authors a shared link chose (the chips name them before the author list is opened).
  const [authorNames, setAuthorNames] = useState<Map<string, string>>(() => new Map())
  const canWrite = canCreateExercise(access)
  // Import: admins into the catalog or any event they manage; moderators into their events.
  const canImport = access.CanImport
  const canExport = access.CanExport
  const atLimit = selected.size >= EXPORT_LIMIT
  // A row is exportable per the server (a moderator: their events' tasks); an older API falls back to the RBAC right.
  const exportable = (item: ExerciseListItem) => item.Permissions ? item.Permissions.CanExport : canExport
  // A row is selectable for export or a bulk action (archive, access) the server allows on it.
  const selectable = (item: ExerciseListItem) => exportable(item) || Boolean(item.Permissions?.CanEdit || item.Permissions?.CanManageAccess)
  const selecting = canExport || access.CanCreateCatalog || access.Events.some((event) => event.CanWrite)
  const pageRows = rows.filter(selectable)
  const allOnPage = pageRows.length > 0 && pageRows.every((row) => selected.has(row.ID))

  function toggle(item: ExerciseListItem) {
    setSelected((current) => {
      const next = new Map(current)
      if (next.has(item.ID)) next.delete(item.ID)
      else if (next.size < EXPORT_LIMIT) next.set(item.ID, item)
      return next
    })
  }

  function toggleAll() {
    setSelected((current) => {
      const next = new Map(current)
      if (allOnPage) {
        for (const row of pageRows) next.delete(row.ID)
      } else {
        for (const row of pageRows) {
          if (next.size >= EXPORT_LIMIT) break
          next.set(row.ID, row)
        }
      }
      return next
    })
  }

  // A bulk action changed these tasks: their rows update in place, nothing reloads.
  function applyCards(cards: Exercise[]) {
    const byId = new Map(cards.map((card) => [card.ID, card]))
    setRows((current) => current.map((row) => {
      const card = byId.get(row.ID)
      return card ? mergeCardIntoRow(row, card) : row
    }))
  }

  // A background import ended (any tab of this page load): the list reloads with its rows kept, so nothing flashes.
  useEffect(() => onImportsDone(() => setReloadKey((key) => key + 1)), [])

  useEffect(() => {
    if (!isAdmin || !loadedAccess) return
    let active = true
    listEventOptions().then((events) => { if (active) setAdminEvents(events) }).catch(() => undefined)
    return () => { active = false }
  }, [isAdmin, loadedAccess])

  // The authors a link chose are named once; the filter's own list names the ones picked later.
  const [initialAuthors] = useState(() => filters.authors)
  useEffect(() => {
    if (initialAuthors.length === 0) return
    let active = true
    listExerciseAuthors("", MAX_AUTHORS, initialAuthors.slice(0, MAX_AUTHORS))
      .then((authors) => { if (active) setAuthorNames((before) => new Map([...before, ...authors.map((author) => [author.ID, author.Name || t("exercises.filter.author.noName")] as const)])) })
      .catch(() => undefined)
    return () => { active = false }
  }, [initialAuthors])

  const eventOptions: EventOption[] = useMemo(() => isAdmin
    ? [...access.Events.map(({ ID, Name, Tag }) => ({ ID, Name, Tag })), ...adminEvents.filter((event) => !access.Events.some((own) => own.ID === event.ID))]
    : access.Events.map(({ ID, Name, Tag }) => ({ ID, Name, Tag })), [isAdmin, access.Events, adminEvents])
  const eventName = (id: string) => {
    const event = eventOptions.find((option) => option.ID === id)
    return event ? event.Name || event.Tag : undefined
  }
  const writableEventIds = writableEvents(access).map((event) => event.ID)
  // The one writable event the filter names: where «Створити» and «Імпорт» start.
  const [onlyEvent] = filters.events
  const filteredEvent = filters.events.length === 1 && writableEventIds.includes(onlyEvent) ? onlyEvent : null

  function createHref(): string {
    return filteredEvent ? `/new?event=${encodeURIComponent(filteredEvent)}` : "/new"
  }

  function update(patch: Partial<CatalogFilters>) {
    setFilters((current) => ({ ...current, ...patch }))
    goToPage(1)
  }

  useEffect(() => {
    const id = setTimeout(() => {
      const next = search.trim()
      if (next !== filters.search) update({ search: next })
    }, 300)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- update only sets state
  }, [search, filters.search])

  // Keep the filters in the address bar so a reload or a shared link restores them.
  useEffect(() => {
    const query = filtersToSearch(filters, isAdmin)
    if (window.location.search.replace(/^\?/, "") !== query) {
      window.history.replaceState(window.history.state, "", query ? `?${query}` : window.location.pathname)
    }
  }, [filters, isAdmin])

  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active) { setLoading(true); setError(null) } })
    loadCatalogPage(listExercisesPage, filters, page, pageSize)
      .then((data) => { if (active) { setRows(data.Items); setTotal(data.Total) } })
      .catch((cause) => { if (active) setError({ cause }) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [filters, page, pageSize, reloadKey])

  function goToPage(next: number) {
    if (tableScrollRef.current) tableScrollRef.current.scrollTop = 0
    setLoading(true)
    setPage(next)
  }

  function sort(field: string) {
    const sortDir = field === filters.sortBy ? filters.sortDir === "asc" ? "desc" : "asc" : field === "updated" ? "desc" : "asc"
    update({ sortBy: field, sortDir })
  }

  const retry = () => { setError(null); setLoading(true); setReloadKey((key) => key + 1) }
  const filtered = hasActiveFilters(filters, isAdmin)
  const activeCount = countActiveFilters(filters, isAdmin)
  const reset = () => update(clearedFilters(filters, isAdmin))
  const authorLabel = (id: string) => authorNames.get(id)
  const onAuthorsLoaded = useCallback((options: FilterOption[]) => setAuthorNames((before) => new Map([...before, ...options.map(({ value, label }) => [value, label] as const)])), [])
  const fieldsProps = { filters, isAdmin, eventOptions, authorLabel, onAuthorsLoaded, onChange: update }
  const clearSearch = () => { setSearch(""); update({ search: "" }) }
  const searchControl = <CatalogSearch value={search} onChange={setSearch} onClear={clearSearch} />
  const filterFields = <>
    <ScopeFilterField filters={filters} isAdmin={isAdmin} onChange={(scope) => update({ scope })} className="catalog-storage-field" />
    <CatalogFilterFields {...fieldsProps} className="catalog-filter-grid" />
  </>
  const sortProps = { activeField: filters.sortBy, direction: filters.sortDir, onSort: sort }

  return (
    <div className="catalog-screen frost-panel">
      <h1 className="sr-only">{t("exercises.nav.catalog")}</h1>
      <div className="catalog-toolbar">
        <div className="catalog-search-toolbar">
          {!mobile && searchControl}
          <Button type="button" variant="outline" aria-expanded={mobile ? sheetOpen : filtersOpen} aria-controls={mobile ? undefined : "catalog-filters"} aria-haspopup={mobile ? "dialog" : undefined} onClick={() => mobile ? setSheetOpen(true) : setFiltersOpen((open) => !open)}>
            <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
            {activeCount > 0 ? t("exercises.filter.openCount", { count: activeCount }) : t("exercises.filter.open")}
          </Button>
        </div>
        {(canWrite || canImport) && <div className="catalog-create-actions">
          {canImport && <Button type="button" variant="outline" onClick={() => { setImportJobId(undefined); setImportOpen(true) }}><Upload aria-hidden="true" className="h-4 w-4" />{t("admin.exImport.button")}</Button>}
          {canWrite && <Button type="button" onClick={() => router.push(createHref())}>{t("admin.ex.create.button")}</Button>}
        </div>}
      </div>
      <AppliedFilters filters={filters} isAdmin={isAdmin} mobile={mobile} eventLabel={eventName} authorLabel={authorLabel} onChange={update} onClearSearch={clearSearch} onReset={reset} active={activeCount} />
      {!mobile && filtersOpen && <section id="catalog-filters" aria-label={t("exercises.filter.label")} className="catalog-filter-panel">
        <div className="catalog-panel-heading"><h2>{t("exercises.filter.label")}</h2><Button variant="ghost" size="sm" onClick={() => setFiltersOpen(false)}><X aria-hidden="true" className="h-4 w-4" />{t("exercises.catalog.collapseFilters")}</Button></div>
        {filterFields}
        <div className="catalog-panel-done"><Button variant="outline" onClick={() => setFiltersOpen(false)}>{t("exercises.filter.done")}</Button></div>
      </section>}
      <FiltersSheet open={mobile && sheetOpen} onOpenChange={setSheetOpen} active={activeCount} onReset={reset}>
        <div className="catalog-sheet-fields">{mobile && searchControl}{filterFields}</div>
      </FiltersSheet>
      <div className="catalog-result-meta" role="status" aria-live="polite">
        <span>{loading && rows.length === 0 ? t("admin.loading") : error ? t("exercises.nav.catalog") : t("exercises.catalog.total", { count: total })}</span>
        <span>{t("exercises.catalog.storageSummary", { value: filters.scope ? t(`exercises.scope.${filters.scope}`) : t("exercises.catalog.storageAll") })}</span>
      </div>

      <BulkActions selected={[...selected.values()]} canExport={canExport} atLimit={atLimit} onExport={() => setExportOpen(true)}
        onClear={() => setSelected(new Map())} onChanged={applyCards} />

      <CatalogTable rows={rows} selected={selected} selecting={selecting} selectable={selectable} atLimit={atLimit} allOnPage={allOnPage} pageSelectable={pageRows.length}
        onToggle={toggle} onToggleAll={toggleAll} sortProps={sortProps} eventName={eventName} canWrite={canWrite} canImport={canImport} userId={me?.ID ?? null}
        onImportDetails={(jobId) => { setImportJobId(jobId || undefined); setImportOpen(true) }} regionRef={tableScrollRef} busy={loading}
        state={error ? <LoadError message={t("admin.ex.loadError")} error={error.cause} onRetry={retry} />
          : loading && rows.length === 0 ? <LoadingArea label={t("admin.loading")} />
          : rows.length === 0 ? <EmptyState message={t(filtered ? "admin.ex.emptyFiltered" : "admin.ex.empty")} /> : undefined} />
      <TablePagination page={page} pageSize={pageSize} total={total}
        onPage={goToPage} onPageSize={(size) => { setPageSize(size); goToPage(1) }} />
      {exportOpen && <ExportDialog exerciseIds={[...selected.keys()]} onClose={() => setExportOpen(false)} onExported={() => setSelected(new Map())} />}
      {importOpen && <ImportDialog key={importJobId ?? "new"} jobId={importJobId}
        isOriginActive={() => originActive.current} targets={ownerOptions(access, t("exercises.owner.catalog"))} initialTarget={filteredEvent}
        onClose={() => { setImportOpen(false); setImportJobId(undefined) }} onImported={() => setReloadKey((key) => key + 1)} />}
    </div>
  )
}

function CatalogSearch({ value, onChange, onClear }: { value: string; onChange: (value: string) => void; onClear: () => void }) {
  return <div className="catalog-search">
    <label className="catalog-search-label" htmlFor="catalog-search">{t("admin.ex.search")}</label>
    <div className="catalog-search-input"><Search aria-hidden="true" />
      <Input id="catalog-search" type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={t("admin.ex.search")} aria-label={t("admin.ex.search")} />
      {value && <button type="button" className="catalog-icon" aria-label={t("exercises.catalog.clearSearch")} onClick={onClear}><X aria-hidden="true" /></button>}
    </div>
  </div>
}
