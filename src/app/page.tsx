"use client"
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Upload } from "lucide-react"
import { t } from "@/i18n/t"
import { useRole } from "@/lib/useRole"
import { listExercisesPage, type ExerciseListItem } from "@/api/exercises/catalog"
import { EXPORT_LIMIT } from "@/api/exercises/archive"
import { ExportDialog } from "@/components/exercises/ExportDialog"
import { ImportDialog } from "@/components/exercises/ImportDialog"
import { TagInput } from "@/components/exercises/TagInput"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { LoadingArea } from "@/components/ui/spinner"
import { EmptyState } from "@/components/ui/empty-state"
import { TablePagination } from "@/components/ui/table-pagination"
import { SortableHeader } from "@/components/ui/sortable-header"
import { SelectMenu } from "@/components/ui/select-menu"

function StatusBadges({ item }: { item: ExerciseListItem }) {
  return (
    <span className="flex flex-wrap gap-1">
      {item.ArchivedAt && (
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t("admin.ex.status.archived")}</span>
      )}
      {item.HasDraft && (
        <span className="rounded-full bg-secondary/40 px-2 py-0.5 text-xs">{t("admin.ex.status.draft")}</span>
      )}
      {item.HasPublished && (
        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">{t("admin.ex.status.published")}</span>
      )}
      {!item.ArchivedAt && !item.HasDraft && !item.HasPublished && <span className="text-xs text-muted-foreground">—</span>}
    </span>
  )
}

export default function Page() {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [debounced, setDebounced] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [status, setStatus] = useState("all")
  const [rows, setRows] = useState<ExerciseListItem[]>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [total, setTotal] = useState(0)
  const [sortBy, setSortBy] = useState("updated")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [exportOpen, setExportOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const tableScrollRef = useRef<HTMLDivElement>(null)

  const { can } = useRole()
  const canWrite = can("exercises.write")
  const canExport = can("exercises.export")
  const atLimit = selected.size >= EXPORT_LIMIT
  const pageIds = rows.map((row) => row.ID)
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id))
  const selectionLabel = t("admin.ex.selection.count").replace("{count}", String(selected.size))

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
    const id = setTimeout(() => { setDebounced(search.trim()); setPage(1) }, 300)
    return () => clearTimeout(id)
  }, [search])

  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active) { setLoading(true); setError(false) } })
    listExercisesPage({
      search: debounced, tags,
      status: status === "all" || status === "archived" ? "" : status,
      archived: status === "archived" ? "only" : undefined,
      page, pageSize, sortBy, sortDir,
    })
      .then((data) => { if (active) { setRows(data.Items); setTotal(data.Total) } })
      .catch(() => { if (active) setError(true) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [debounced, tags, status, page, pageSize, sortBy, sortDir, reloadKey])

  function goToPage(next: number) {
    if (tableScrollRef.current) tableScrollRef.current.scrollTop = 0
    setLoading(true)
    setPage(next)
  }

  function sort(field: string) {
    setSortDir(field === sortBy ? sortDir === "asc" ? "desc" : "asc" : field === "updated" ? "desc" : "asc")
    setSortBy(field)
    goToPage(1)
  }

  const retry = () => { setError(false); setLoading(true); setReloadKey((key) => key + 1) }

  return (
    <div className="frost-panel frost-in flex h-full min-h-0 flex-col overflow-hidden rounded-lg p-6">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("admin.ex.search")}
          aria-label={t("admin.ex.search")}
          className="min-w-[min(100%,14rem)] flex-1 lg:max-w-sm"
        />
        <div className="min-w-64 max-w-md flex-1">
          <TagInput value={tags} onChange={(value) => { setTags(value); goToPage(1) }} placeholder={t("admin.ex.filterTags.placeholder")} className="min-h-10" />
        </div>
        <SelectMenu value={status} onChange={(value) => { setStatus(value); goToPage(1) }}
          options={[
            { value: "all", label: t("admin.ex.filterStatusAll") },
            { value: "draft", label: t("admin.ex.status.draft") },
            { value: "published", label: t("admin.ex.status.published") },
            { value: "none", label: t("admin.ex.filterStatusNone") },
            { value: "archived", label: t("admin.ex.filterStatusArchived") },
          ]}
          ariaLabel={t("admin.ex.filterStatus")} className="h-10 min-w-44 text-sm" />
        {canWrite && (
          <div className="ml-auto flex shrink-0 gap-2">
            <Button type="button" variant="outline" onClick={() => setImportOpen(true)} className="h-10 text-sm">
              <Upload aria-hidden="true" className="mr-1.5 h-4 w-4" />{t("admin.exImport.button")}
            </Button>
            <Button type="button" onClick={() => router.push("/new")} className="h-10 shrink-0 text-sm">{t("admin.ex.create.button")}</Button>
          </div>
        )}
      </div>

      {canExport && selected.size > 0 && (
        <div role="region" aria-label={selectionLabel} className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm">
          <span className="font-medium">{selectionLabel}</span>
          <Button type="button" size="sm" onClick={() => setExportOpen(true)}>{t("admin.ex.selection.export")}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>{t("admin.ex.selection.clear")}</Button>
          {atLimit && <span className="text-xs text-muted-foreground">{t("admin.ex.selection.limit")}</span>}
        </div>
      )}

      <div ref={tableScrollRef} className="relative min-h-0 flex-1 overflow-auto" aria-busy={loading}>
      {error && rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8"><p role="alert" className="text-center text-sm text-destructive">{t("admin.ex.loadError")}</p><Button variant="outline" onClick={retry}>{t("admin.ex.retry")}</Button></div>
      ) : loading && rows.length === 0 ? (
        <LoadingArea className="h-full" label={t("admin.loading")} />
      ) : rows.length === 0 ? (
        <EmptyState message={t(debounced || tags.length > 0 || status !== "all" ? "admin.ex.emptyFiltered" : "admin.ex.empty")} className="h-full" />
      ) : (
        <div>
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                {canExport && <th className="w-10 px-3 py-2">
                  <input type="checkbox" aria-label={t("admin.ex.select.all")} checked={allOnPage} onChange={toggleAll} className="h-4 w-4 accent-primary" />
                </th>}
                <SortableHeader label={t("admin.ex.col.name")} field="name" activeField={sortBy} direction={sortDir} onSort={sort} />
                <SortableHeader label={t("admin.ex.col.tags")} field="tags" activeField={sortBy} direction={sortDir} onSort={sort} />
                <SortableHeader label={t("admin.ex.col.status")} field="status" activeField={sortBy} direction={sortDir} onSort={sort} />
                <SortableHeader label={t("admin.ex.col.updated")} field="updated" activeField={sortBy} direction={sortDir} onSort={sort} />
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.ID} className={`border-b border-border/50 transition-colors hover:bg-accent/10 ${item.ArchivedAt ? "text-muted-foreground" : ""}`}>
                  {canExport && <td className="px-3 py-2">
                    <input type="checkbox" aria-label={`${t("admin.ex.select.row")}: ${item.Name}`} checked={selected.has(item.ID)}
                      disabled={!selected.has(item.ID) && atLimit} onChange={() => toggle(item.ID)} className="h-4 w-4 accent-primary" />
                  </td>}
                  <td className="px-3 py-2">
                    <Link href={`/detail?id=${item.ID}`} className="block">
                      <span className="font-medium text-foreground">{item.Name}</span>
                      {item.Description && (
                        <span className="block max-w-md truncate text-xs text-muted-foreground">{item.Description}</span>
                      )}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex flex-wrap gap-1">
                      {item.Tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-secondary/40 px-2 py-0.5 text-xs">{tag}</span>
                      ))}
                    </span>
                  </td>
                  <td className="px-3 py-2"><StatusBadges item={item} /></td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                    {item.UpdatedAt ? new Date(item.UpdatedAt).toLocaleString("uk-UA", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && rows.length > 0 && <div className="sticky bottom-3 ml-auto mr-3 flex w-fit items-center gap-2 rounded-md border border-destructive bg-card px-3 py-1.5 text-xs text-destructive"><span role="alert">{t("admin.ex.loadError")}</span><Button variant="outline" size="sm" onClick={retry}>{t("admin.ex.retry")}</Button></div>}
      </div>
      <TablePagination page={page} pageSize={pageSize} total={total} busy={loading}
        onPage={goToPage} onPageSize={(size) => { setPageSize(size); goToPage(1) }} />
      {exportOpen && <ExportDialog exerciseIds={[...selected]} onClose={() => setExportOpen(false)} onExported={() => setSelected(new Set())} />}
      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} onImported={() => setReloadKey((key) => key + 1)} />}
    </div>
  )
}
