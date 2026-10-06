"use client"
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Upload } from "lucide-react"
import { t } from "@/i18n/t"
import { tRich } from "@/i18n/tRich"
import { useRole } from "@/lib/useRole"
import { listExercisesPage, type ExerciseListItem, type InfrastructureFilter, type ScopeFilter } from "@/api/exercises/catalog"
import { listEventOptions, type EventOption } from "@/api/events/list"
import { useExerciseAccess } from "@/components/shell/AccessContext"
import { accessFromRbac, canCreateExercise, writableEvents } from "@/lib/exerciseRights"
import { defaultFilters, filtersFromSearch, filtersToSearch, loadCatalogPage, type CatalogFilters, type StatusFilter } from "@/lib/catalogList"
import { InfrastructureIcon, OwnershipBadges } from "@/components/exercises/OwnershipBadges"
import { AccessCell, StatusCell } from "@/components/exercises/catalog/CatalogCells"
import { EventMultiSelect } from "@/components/exercises/catalog/EventMultiSelect"
import { TagFilter } from "@/components/exercises/catalog/TagFilter"
import { EXPORT_LIMIT } from "@/api/exercises/archive"
import { ExportDialog } from "@/components/exercises/ExportDialog"
import { ImportDialog } from "@/components/exercises/ImportDialog"
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
import { Segmented } from "@/components/ui/segmented"
import { SelectMenu } from "@/components/ui/select-menu"

/** Label row of a filter, with a help icon. */
function FilterField({ label, help, helpContent, children, className }: { label: string; help?: string[]; helpContent?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className ?? ""}`}>
      <span className="flex items-center gap-1 text-[length:var(--ib-fs-13)] text-muted-foreground">{label}{help && <FieldHelp lines={help} content={helpContent} />}</span>
      {children}
    </div>
  )
}

/** One i18n key per help line: `${prefix}.${name}`. */
function helpLines(prefix: string, names: string[]): string[] {
  return names.map((name) => t(`${prefix}.${name}`))
}

/** Filters from the URL (static export: read once on mount, no Suspense needed). */
function initialFilters(isAdmin: boolean): CatalogFilters {
  return typeof window === "undefined" ? defaultFilters(isAdmin) : filtersFromSearch(window.location.search, isAdmin)
}

const STATUS_OPTION_KEYS: Record<StatusFilter, string> = {
  all: "admin.ex.filterStatusAll",
  published: "admin.ex.filterStatusPublished",
  changed: "admin.ex.filterStatusChanged",
  draft: "admin.ex.filterStatusDraftOnly",
  archived: "admin.ex.filterStatusArchived",
}

export default function Page() {
  const router = useRouter()
  const [rows, setRows] = useState<ExerciseListItem[]>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ cause: unknown } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [exportOpen, setExportOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const tableScrollRef = useRef<HTMLDivElement>(null)

  const { can } = useRole()
  const { access: loadedAccess } = useExerciseAccess()
  const access = loadedAccess ?? accessFromRbac(can)
  const isAdmin = access.IsAdmin
  const [filters, setFilters] = useState<CatalogFilters>(() => initialFilters(isAdmin))
  const [search, setSearch] = useState(filters.search)
  const [adminEvents, setAdminEvents] = useState<EventOption[]>([])
  const canWrite = canCreateExercise(access)
  // Import creates catalog exercises: admins only.
  const canImport = access.CanCreateCatalog
  const canExport = access.CanExport
  const atLimit = selected.size >= EXPORT_LIMIT
  const pageIds = rows.map((row) => row.ID)
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id))
  const columns = canExport ? 6 : 5
  const selectionLabel = t("admin.ex.selection.count", { count: selected.size })

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else if (next.size < EXPORT_LIMIT) next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((current) => {
      const next = new Set(current)
      if (allOnPage) {
        for (const id of pageIds) next.delete(id)
      } else {
        for (const id of pageIds) {
          if (next.size >= EXPORT_LIMIT) break
          next.add(id)
        }
      }
      return next
    })
  }

  useEffect(() => {
    if (!isAdmin || !loadedAccess) return
    let active = true
    listEventOptions().then((events) => { if (active) setAdminEvents(events) }).catch(() => undefined)
    return () => { active = false }
  }, [isAdmin, loadedAccess])

  const eventOptions: EventOption[] = isAdmin
    ? [...access.Events.map(({ ID, Name, Tag }) => ({ ID, Name, Tag })), ...adminEvents.filter((event) => !access.Events.some((own) => own.ID === event.ID))]
    : access.Events.map(({ ID, Name, Tag }) => ({ ID, Name, Tag }))
  const eventName = (id: string) => {
    const event = eventOptions.find((option) => option.ID === id)
    return event ? event.Name || event.Tag : undefined
  }
  const writableEventIds = writableEvents(access).map((event) => event.ID)

  function createHref(): string {
    const [only] = filters.events
    return filters.events.length === 1 && writableEventIds.includes(only) ? `/new?event=${encodeURIComponent(only)}` : "/new"
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
  const defaults = defaultFilters(isAdmin)
  const filtered = Boolean(filters.search || filters.tags.length > 0 || filters.status !== "all" || filters.events.length > 0
    || filters.infrastructure || filters.scope !== defaults.scope)
  // Broadest to narrowest; «Усі» is admin-only.
  const scopeTabs: ScopeFilter[] = [...(isAdmin ? [""] as ScopeFilter[] : []), "catalog", "event"]
  const scopeHelpLine = (value: ScopeFilter) => t("exercises.help.scope.line", { name: t(`exercises.scope.${value || "all"}`), text: t(`exercises.help.scope.${value || "all"}`) })
  // The events filter means different things per tab (server: owned, available, or both).
  const eventsMode = filters.scope || "all"
  const statusOptions: StatusFilter[] = ["all", "published", "changed", "draft", ...(isAdmin ? ["archived" as const] : [])]

  return (
    <div className="frost-panel flex h-full min-h-0 flex-col overflow-hidden rounded-lg p-3 sm:p-6">
      <h1 className="sr-only">{t("exercises.nav.catalog")}</h1>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("admin.ex.search")}
          aria-label={t("admin.ex.search")}
          className="min-w-[min(100%,14rem)] flex-1 lg:max-w-sm"
        />
        {(canWrite || canImport) && (
          <div className="ml-auto flex shrink-0 gap-2">
            {canImport && <Button type="button" variant="outline" onClick={() => setImportOpen(true)} className="h-10 text-sm">
              <Upload aria-hidden="true" className="mr-1.5 h-4 w-4" />{t("admin.exImport.button")}
            </Button>}
            {canWrite && <Button type="button" onClick={() => router.push(createHref())} className="h-10 shrink-0 text-sm">{t("admin.ex.create.button")}</Button>}
          </div>
        )}
      </div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <FilterField label={t("exercises.scope.label")} help={scopeTabs.map((value) => scopeHelpLine(value))}
          helpContent={<ul className="space-y-1">{scopeTabs.map((value) => (
            <li key={value || "all"}>{tRich("exercises.help.scope.line", { name: <strong className="font-semibold">{t(`exercises.scope.${value || "all"}`)}</strong>, text: t(`exercises.help.scope.${value || "all"}`) })}</li>
          ))}</ul>}>
          <Segmented value={filters.scope} onChange={(value) => update({ scope: value as ScopeFilter })} ariaLabel={t("exercises.scope.label")}
            options={scopeTabs.map((value) => ({ value, label: t(`exercises.scope.${value || "all"}`) }))} />
        </FilterField>
        {(eventOptions.length > 0 || filters.events.length > 0) && (
          <FilterField label={t(`exercises.filter.events.${eventsMode}`)} help={[t(`exercises.help.events.${eventsMode}`)]}>
            <EventMultiSelect label={t(`exercises.filter.events.${eventsMode}`)} options={eventOptions} value={filters.events}
              onChange={(events) => update({ events })} className="min-w-48 max-w-72 text-sm" />
          </FilterField>
        )}
        <FilterField label={t("exercises.filter.infra")} help={helpLines("exercises.help.infra", ["needed", "notNeeded"])}>
          <SelectMenu value={filters.infrastructure} onChange={(value) => update({ infrastructure: value as InfrastructureFilter })}
            options={[
              { value: "", label: t("exercises.filter.infraAll") },
              { value: "yes", label: t("exercises.filter.infraYes") },
              { value: "no", label: t("exercises.filter.infraNo") },
            ]}
            ariaLabel={t("exercises.filter.infra")} className="h-10 min-w-48 text-sm" />
        </FilterField>
        <FilterField label={t("admin.ex.col.status")} help={helpLines("exercises.help.statusFilter", ["published", "changed", "draftOnly"])}>
          <SelectMenu value={filters.status} onChange={(value) => update({ status: value as StatusFilter })}
            options={statusOptions.map((value) => ({ value, label: t(STATUS_OPTION_KEYS[value]) }))}
            ariaLabel={t("admin.ex.filterStatus")} className="h-10 min-w-44 text-sm" />
        </FilterField>
        <FilterField label={t("admin.ex.filterTags.label")} help={helpLines("exercises.help.tags", ["any", "existing"])} className="min-w-64 max-w-md flex-1">
          <TagFilter value={filters.tags} onChange={(tags) => update({ tags })} />
        </FilterField>
      </div>

      {canExport && selected.size > 0 && (
        <div role="region" aria-label={selectionLabel} className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm">
          <span className="font-medium">{selectionLabel}</span>
          <Button type="button" size="sm" onClick={() => setExportOpen(true)}>{t("admin.ex.selection.export")}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>{t("admin.ex.selection.clear")}</Button>
          {atLimit && <span className="text-xs text-muted-foreground">{t("admin.ex.selection.limit")}</span>}
        </div>
      )}

      <Table label={t("accountMenu.exercises")} regionRef={tableScrollRef} busy={loading} className="min-w-[56rem]">
        <thead>
          <tr className={TABLE_HEAD_ROW}>
            {canExport && <th scope="col" className={`${TABLE_HEAD_CELL} w-10`}>
              <label className="inline-flex h-6 w-6 items-center justify-center">
                <input type="checkbox" aria-label={t("admin.ex.select.all")} checked={allOnPage} onChange={toggleAll} className="h-4 w-4 accent-primary" />
              </label>
            </th>}
            <SortableHeader label={t("admin.ex.col.name")} field="name" activeField={filters.sortBy} direction={filters.sortDir} onSort={sort} />
            <SortableHeader label={t("admin.ex.col.tags")} field="tags" activeField={filters.sortBy} direction={filters.sortDir} onSort={sort} />
            <th scope="col" className={TABLE_HEAD_CELL}>
              <span className="inline-flex items-center gap-1.5">{t("admin.ex.col.access")}<FieldHelp lines={helpLines("exercises.help.accessCol", ["who", "none", "event"])} /></span>
            </th>
            <SortableHeader label={t("admin.ex.col.status")} field="status" activeField={filters.sortBy} direction={filters.sortDir} onSort={sort}>
              <FieldHelp lines={helpLines("exercises.help.statusCol", ["published", "draft", "archived"])} />
            </SortableHeader>
            <SortableHeader label={t("admin.ex.col.updated")} field="updated" activeField={filters.sortBy} direction={filters.sortDir} onSort={sort} />
          </tr>
        </thead>
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
                {canExport && <td className={TABLE_CELL}>
                  <label className="relative z-10 inline-flex h-6 w-6 items-center justify-center">
                    <input type="checkbox" aria-label={t("admin.ex.select.rowNamed", { name: item.Name })} checked={selected.has(item.ID)}
                      disabled={!selected.has(item.ID) && atLimit} onChange={() => toggle(item.ID)} className="h-4 w-4 accent-primary" />
                  </label>
                </td>}
                <td className={TABLE_CELL}>
                  <span className="flex items-center gap-1.5">
                    <Link href={`/detail?id=${item.ID}`} className="font-medium text-foreground after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-2 focus-visible:outline-primary">{item.Name}</Link>
                    <InfrastructureIcon show={item.Infrastructure} />
                  </span>
                  {item.Description && (
                    <span className="block max-w-md truncate text-xs text-muted-foreground">{item.Description}</span>
                  )}
                  <div className="mt-1 empty:hidden"><OwnershipBadges exercise={item} showAccess={false} showEvent={false} /></div>
                </td>
                <td className={TABLE_CELL}>
                  <span className="flex flex-wrap gap-1">
                    {item.Tags.map((tag) => (
                      <span key={tag} className="rounded-[4px] bg-secondary/40 px-2 py-0.5 text-xs">{tag}</span>
                    ))}
                  </span>
                </td>
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
      {exportOpen && <ExportDialog exerciseIds={[...selected]} onClose={() => setExportOpen(false)} onExported={() => setSelected(new Set())} />}
      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} onImported={() => setReloadKey((key) => key + 1)} />}
    </div>
  )
}
