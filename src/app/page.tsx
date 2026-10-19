"use client"
import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { SlidersHorizontal, Upload } from "lucide-react"
import { t } from "@/i18n/t"
import { useRole } from "@/lib/useRole"
import { listExerciseAuthors, listExercisesPage, type Exercise, type ExerciseListItem, type ScopeFilter } from "@/api/exercises/catalog"
import { listEventOptions, type EventOption } from "@/api/events/list"
import { useExerciseAccess } from "@/components/shell/AccessContext"
import { accessFromRbac, canCreateExercise, ownerOptions, writableEvents } from "@/lib/exerciseRights"
import {
  clearedFilters, countActiveFilters, defaultFilters, filtersFromSearch, filtersToSearch, hasActiveFilters, loadCatalogPage, MAX_AUTHORS, mergeCardIntoRow, type CatalogFilters,
} from "@/lib/catalogList"
import { InfrastructureIcon, OwnershipBadges } from "@/components/exercises/OwnershipBadges"
import { AccessCell, AuthorCell, DifficultyCell, StatusCell } from "@/components/exercises/catalog/CatalogCells"
import { CatalogFilterFields, ScopeFilterField, helpLines } from "@/components/exercises/catalog/CatalogFilterFields"
import { FiltersSheet } from "@/components/exercises/catalog/FiltersSheet"
import { BrowserDraftRow } from "@/components/exercises/catalog/BrowserDraftRow"
import { BulkActions } from "@/components/exercises/catalog/BulkActions"
import { EXPORT_LIMIT } from "@/api/exercises/archive"
import { ExportDialog } from "@/components/exercises/ExportDialog"
import { ImportDialog } from "@/components/exercises/ImportDialog"
import { ImportRows } from "@/components/exercises/catalog/ImportRows"
import { onImportsDone } from "@/lib/importJobs"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { FieldHelp } from "@/components/ui/field-help"
import { LoadingArea } from "@/components/ui/spinner"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadError } from "@/components/ui/load-error"
import { TablePagination } from "@/components/ui/table-pagination"
import { SortableHeader } from "@/components/ui/sortable-header"
import { Table, TableState, TABLE_CELL, TABLE_HEAD_CELL, TABLE_HEAD_ROW, TABLE_ROW } from "@/components/ui/table"
import { formatExerciseDateTime } from "@/lib/exerciseStatus"
import { cn } from "@/utils/cn"

/** Filters from the URL (static export: read once on mount, no Suspense needed). */
function initialFilters(isAdmin: boolean): CatalogFilters {
  return typeof window === "undefined" ? defaultFilters(isAdmin) : filtersFromSearch(window.location.search, isAdmin)
}

// On a phone the first columns stay in view while the table scrolls sideways.
const STICKY_SELECT = "max-sm:sticky max-sm:left-0 max-sm:z-10 max-sm:bg-card"
const STICKY_NAME = "max-sm:sticky max-sm:z-10 max-sm:bg-card"

export default function Page() {
  const router = useRouter()
  const [sheetOpen, setSheetOpen] = useState(false)
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
  const columns = selecting ? 8 : 7

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
      .then((authors) => { if (active) setAuthorNames(new Map(authors.map((author) => [author.ID, author.Name || t("exercises.filter.author.noName")]))) })
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
  const fieldsProps = { filters, isAdmin, eventOptions, authorLabel, onChange: update }
  const sortProps = { activeField: filters.sortBy, direction: filters.sortDir, onSort: sort }

  return (
    <div className="frost-panel flex min-h-full min-w-0 flex-col rounded-lg sm:h-full sm:min-h-0 sm:overflow-hidden p-3 sm:p-6">
      <h1 className="sr-only">{t("exercises.nav.catalog")}</h1>
      <div className="mb-3 flex flex-wrap items-center gap-2 sm:gap-3">
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("admin.ex.search")}
          aria-label={t("admin.ex.search")}
          className="w-full min-w-0 sm:w-auto sm:min-w-[14rem] sm:flex-1 lg:max-w-sm"
        />
        <Button type="button" variant="outline" className="h-10 px-3 sm:hidden" aria-haspopup="dialog" onClick={() => setSheetOpen(true)}>
          <SlidersHorizontal aria-hidden="true" className="mr-1.5 h-4 w-4" />
          {activeCount > 0 ? t("exercises.filter.openCount", { count: activeCount }) : t("exercises.filter.open")}
        </Button>
        {activeCount > 0 && <Button type="button" variant="ghost" className="hidden h-10 text-sm sm:inline-flex" onClick={reset}>{t("exercises.filter.reset")}</Button>}
        {(canWrite || canImport) && (
          <div className="ml-auto flex shrink-0 gap-2">
            {/* On a phone the import is its icon, so the filters, import and create share one row. */}
            {canImport && <Button type="button" variant="outline" onClick={() => { setImportJobId(undefined); setImportOpen(true) }} className="h-10 px-3 text-sm sm:px-4">
              <Upload aria-hidden="true" className="h-4 w-4 sm:mr-1.5" /><span className="max-sm:sr-only">{t("admin.exImport.button")}</span>
            </Button>}
            {canWrite && <Button type="button" onClick={() => router.push(createHref())} className="h-10 shrink-0 text-sm">{t("admin.ex.create.button")}</Button>}
          </div>
        )}
      </div>
      <section aria-label={t("exercises.filter.label")} className="mb-3 hidden min-w-0 gap-x-3 gap-y-2 sm:grid sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <ScopeFilterField filters={filters} isAdmin={isAdmin} onChange={(scope: ScopeFilter) => update({ scope })} className="sm:col-span-2" />
        <CatalogFilterFields {...fieldsProps} className="contents" rangeClassName="sm:col-span-2" tagsClassName="sm:col-span-2" />
      </section>
      <FiltersSheet open={sheetOpen} onOpenChange={setSheetOpen} active={activeCount} onReset={reset}>
        <div className="flex flex-col gap-3">
          <ScopeFilterField filters={filters} isAdmin={isAdmin} onChange={(scope: ScopeFilter) => update({ scope })} />
          <CatalogFilterFields {...fieldsProps} className="contents" />
        </div>
      </FiltersSheet>

      <BulkActions selected={[...selected.values()]} canExport={canExport} atLimit={atLimit} onExport={() => setExportOpen(true)}
        onClear={() => setSelected(new Map())} onChanged={applyCards} />

      <Table regionClassName="min-h-64 shrink-0 sm:min-h-0 sm:shrink" label={t("accountMenu.exercises")} regionRef={tableScrollRef} busy={loading} className="min-w-[64rem]">
        <thead>
          <tr className={TABLE_HEAD_ROW}>
            {selecting && <th scope="col" className={cn(TABLE_HEAD_CELL, "w-10", "max-sm:left-0 max-sm:z-30")}>
              <label className="inline-flex h-6 w-6 items-center justify-center">
                <input type="checkbox" aria-label={t("admin.ex.select.all")} checked={allOnPage} disabled={pageRows.length === 0} onChange={toggleAll} className="h-4 w-4 accent-primary" />
              </label>
            </th>}
            <SortableHeader label={t("admin.ex.col.name")} field="name" {...sortProps} className={cn("max-sm:z-30", selecting ? "max-sm:left-10" : "max-sm:left-0")} />
            <SortableHeader label={t("admin.ex.col.author")} field="author" {...sortProps}>
              <FieldHelp lines={[t("exercises.help.authorCol.who")]} />
            </SortableHeader>
            <SortableHeader label={t("admin.ex.col.tags")} field="tags" {...sortProps} />
            <SortableHeader label={t("admin.ex.col.difficulty")} field="difficulty" {...sortProps} className="whitespace-nowrap">
              <FieldHelp lines={helpLines("exercises.help.difficultyCol", ["source", "level"])} />
            </SortableHeader>
            <th scope="col" className={TABLE_HEAD_CELL}>
              <span className="inline-flex items-center gap-1.5">{t("admin.ex.col.access")}<FieldHelp lines={helpLines("exercises.help.accessCol", ["who", "none", "event"])} /></span>
            </th>
            <SortableHeader label={t("admin.ex.col.status")} field="status" {...sortProps}>
              <FieldHelp lines={helpLines("exercises.help.statusCol", ["published", "draft", "archived"])} />
            </SortableHeader>
            <SortableHeader label={t("admin.ex.col.updated")} field="updated" {...sortProps} />
          </tr>
        </thead>
        {canWrite && <BrowserDraftRow userId={me?.ID ?? null} columns={columns} />}
        {canImport && <ImportRows columns={columns} onDetails={(jobId) => { setImportJobId(jobId); setImportOpen(true) }} />}
        {error ? (
          <TableState colSpan={columns}><LoadError message={t("admin.ex.loadError")} error={error.cause} onRetry={retry} /></TableState>
        ) : loading && rows.length === 0 ? (
          <TableState colSpan={columns}><LoadingArea label={t("admin.loading")} /></TableState>
        ) : rows.length === 0 ? (
          <TableState colSpan={columns}><EmptyState message={t(filtered ? "admin.ex.emptyFiltered" : "admin.ex.empty")} /></TableState>
        ) : (
          <tbody>
            {rows.map((item) => (
              <tr key={item.ID} className={`relative ${TABLE_ROW} ${item.ArchivedAt ? "text-muted-foreground" : ""}`}>
                {selecting && <td className={cn(TABLE_CELL, STICKY_SELECT)}>
                  {selectable(item) && <label className="relative z-10 inline-flex h-6 w-6 items-center justify-center">
                    <input type="checkbox" aria-label={t("admin.ex.select.rowNamed", { name: item.Name })} checked={selected.has(item.ID)}
                      disabled={!selected.has(item.ID) && atLimit} onChange={() => toggle(item)} className="h-4 w-4 accent-primary" />
                  </label>}
                </td>}
                <td className={cn(TABLE_CELL, STICKY_NAME, selecting ? "max-sm:left-10" : "max-sm:left-0", "max-sm:max-w-[45vw]")}>
                  <span className="flex items-center gap-1.5">
                    <Link href={`/detail?id=${item.ID}`} className="font-medium text-foreground after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-2 focus-visible:outline-primary">{item.Name}</Link>
                    <InfrastructureIcon show={item.Infrastructure} />
                  </span>
                  {item.Description && (
                    <span className="block max-w-[13rem] truncate text-xs text-muted-foreground">{item.Description}</span>
                  )}
                  <div className="mt-1 empty:hidden"><OwnershipBadges exercise={item} showAccess={false} showEvent={false} /></div>
                </td>
                <td className={TABLE_CELL}><AuthorCell name={item.AuthorName} /></td>
                <td className={TABLE_CELL}>
                  <span className="flex flex-wrap gap-1">
                    {item.Tags.map((tag) => (
                      <span key={tag} className="rounded-[4px] bg-border px-2 py-0.5 text-xs">{tag}</span>
                    ))}
                  </span>
                </td>
                <td className={TABLE_CELL}><DifficultyCell average={item.AvgDifficulty} /></td>
                <td className={TABLE_CELL}><AccessCell item={item} eventName={eventName} /></td>
                <td className={TABLE_CELL}><StatusCell item={item} /></td>
                <td className={`${TABLE_CELL} whitespace-nowrap tabular-nums text-muted-foreground`}>
                  {item.UpdatedAt
                    ? <time dateTime={item.UpdatedAt}>{formatExerciseDateTime(item.UpdatedAt)}</time>
                    : <span aria-label={t("admin.ex.none")}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        )}
      </Table>
      <TablePagination page={page} pageSize={pageSize} total={total}
        onPage={goToPage} onPageSize={(size) => { setPageSize(size); goToPage(1) }} />
      {exportOpen && <ExportDialog exerciseIds={[...selected.keys()]} onClose={() => setExportOpen(false)} onExported={() => setSelected(new Map())} />}
      {importOpen && <ImportDialog key={importJobId ?? "new"} jobId={importJobId}
        targets={ownerOptions(access, t("exercises.owner.catalog"))} initialTarget={filteredEvent}
        onClose={() => { setImportOpen(false); setImportJobId(undefined) }} onImported={() => setReloadKey((key) => key + 1)} />}
    </div>
  )
}
