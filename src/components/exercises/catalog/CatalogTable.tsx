"use client"

import { Fragment, useEffect, useId, useState, type ReactNode, type RefObject } from "react"
import Link from "next/link"
import { ChevronDown, ChevronRight, Columns3 } from "lucide-react"
import type { ExerciseListItem } from "@/api/exercises/catalog"
import { t } from "@/i18n/t"
import { InfrastructureIcon, OwnershipBadges } from "@/components/exercises/OwnershipBadges"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { FieldHelp } from "@/components/ui/field-help"
import { SortableHeader } from "@/components/ui/sortable-header"
import { Table, TableState, TABLE_CELL, TABLE_HEAD_CELL, TABLE_HEAD_ROW, TABLE_ROW } from "@/components/ui/table"
import { BrowserDraftRow } from "./BrowserDraftRow"
import { ImportRows } from "./ImportRows"
import { AccessCell, AuthorCell, DifficultyCell, StatusCell, SubtaskCountCell, UpdatedCell, ResourceHeavyBadge } from "./CatalogCells"
import { helpLines } from "./CatalogFilterFields"
import { cn } from "@/utils/cn"

const OPTIONAL = ["tags", "subtasks", "difficulty", "updated"] as const
type OptionalColumn = typeof OPTIONAL[number]

export function CatalogTable({ rows, selected, selecting, selectable, atLimit, allOnPage, pageSelectable, onToggle, onToggleAll, sortProps, eventName, canWrite, canImport, userId, onImportDetails, regionRef, busy, state }: {
  rows: ExerciseListItem[]
  selected: Map<string, ExerciseListItem>
  selecting: boolean
  selectable: (item: ExerciseListItem) => boolean
  atLimit: boolean
  allOnPage: boolean
  pageSelectable: number
  onToggle: (item: ExerciseListItem) => void
  onToggleAll: () => void
  sortProps: { activeField: string; direction: "asc" | "desc"; onSort: (field: string) => void }
  eventName: (id: string) => string | undefined
  canWrite: boolean
  canImport: boolean
  userId: string | null
  onImportDetails: (id: string) => void
  regionRef: RefObject<HTMLDivElement | null>
  busy: boolean
  state?: ReactNode
}) {
  const [visible, setVisible] = useState<Set<OptionalColumn>>(() => new Set())
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [overflow, setOverflow] = useState(false)
  const id = useId()
  const columns = (selecting ? 5 : 4) + visible.size
  useEffect(() => {
    const element = regionRef.current
    if (!element) return
    const check = () => setOverflow(element.scrollWidth > element.clientWidth)
    queueMicrotask(check)
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(check)
    observer?.observe(element)
    return () => observer?.disconnect()
  }, [regionRef, visible, rows])

  const header = (field: OptionalColumn, children?: ReactNode) => visible.has(field) && <SortableHeader label={t(`admin.ex.col.${field}`)} field={field} {...sortProps} className={`catalog-col-${field}`}>{children}</SortableHeader>
  return <>
    {overflow && <p className="catalog-scroll-hint">{t("exercises.catalog.scrollHint")}</p>}
    <Table label={t("accountMenu.exercises")} regionRef={regionRef} busy={busy} regionClassName="catalog-table min-h-64" className={cn("catalog-data", `catalog-options-${visible.size}`, selecting && "catalog-has-selection")}>
      <thead><tr className={TABLE_HEAD_ROW}>
        {selecting && <th scope="col" className={cn(TABLE_HEAD_CELL, "catalog-select")}><label className="catalog-check">
          <input type="checkbox" aria-label={t("admin.ex.select.all")} checked={allOnPage} disabled={!pageSelectable} onChange={onToggleAll}
            ref={(input) => { if (input) input.indeterminate = !allOnPage && rows.some((row) => selected.has(row.ID)) }} />
        </label></th>}
        <SortableHeader label={t("admin.ex.col.name")} field="name" {...sortProps} className="catalog-name" />
        {header("tags")}{header("subtasks")}{header("difficulty", <FieldHelp lines={helpLines("exercises.help.difficultyCol", ["source", "level", "subtasks"])} />)}
        <th scope="col" className={cn(TABLE_HEAD_CELL, "catalog-col-access")}><span className="inline-flex items-center gap-1.5">{t("admin.ex.col.access")}<FieldHelp lines={helpLines("exercises.help.accessCol", ["who", "none", "event"])} /></span></th>
        <SortableHeader label={t("admin.ex.col.status")} field="status" {...sortProps} className="catalog-col-status"><FieldHelp lines={helpLines("exercises.help.statusCol", ["published", "draft", "archived"])} /></SortableHeader>
        <SortableHeader label={t("admin.ex.col.author")} field="author" {...sortProps} className="catalog-col-author">
          <FieldHelp lines={[t("exercises.help.authorCol.who")]} />
          <Popover><PopoverTrigger asChild><button type="button" className="catalog-icon" aria-label={t("exercises.catalog.columns")}><Columns3 aria-hidden="true" /></button></PopoverTrigger>
            <PopoverContent className="w-64"><p className="mb-2 font-medium">{t("exercises.catalog.columns")}</p>{OPTIONAL.map((column) => <label key={column} className="flex min-h-11 cursor-pointer items-center gap-2">
              <input type="checkbox" checked={visible.has(column)} onChange={() => setVisible((before) => { const next = new Set(before); if (next.has(column)) next.delete(column); else next.add(column); return next })} />{t(`admin.ex.col.${column}`)}
            </label>)}</PopoverContent>
          </Popover>
        </SortableHeader>
        {header("updated")}
      </tr></thead>
      {canWrite && <BrowserDraftRow userId={userId} columns={columns} />}
      {canImport && <ImportRows columns={columns} onDetails={onImportDetails} />}
      {state ? <TableState colSpan={columns}>{state}</TableState> : <tbody>{rows.map((item) => {
        const open = expanded.has(item.ID)
        const detailsId = `${id}-${item.ID}`
        return <Fragment key={item.ID}>
          <tr className={cn(TABLE_ROW, selected.has(item.ID) && "catalog-selected", item.ArchivedAt && "text-muted-foreground")}>
            {selecting && <td className={cn(TABLE_CELL, "catalog-select")}>{selectable(item) && <label className="catalog-check"><input type="checkbox" aria-label={t("admin.ex.select.rowNamed", { name: item.Name })} checked={selected.has(item.ID)} disabled={!selected.has(item.ID) && atLimit} onChange={() => onToggle(item)} /></label>}</td>}
            <td className={cn(TABLE_CELL, "catalog-name")}><div className="catalog-name-content">
              <button type="button" className="catalog-icon catalog-expander" aria-expanded={open} aria-controls={open ? detailsId : undefined} aria-label={t(open ? "exercises.catalog.hideDetails" : "exercises.catalog.showDetails", { name: item.Name })}
                onClick={() => setExpanded((before) => { const next = new Set(before); if (next.has(item.ID)) next.delete(item.ID); else next.add(item.ID); return next })}>
                {open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
              </button>
              <Link className="catalog-task-link" href={`/detail?id=${item.ID}`}>{item.Name}</Link><InfrastructureIcon show={item.Infrastructure} />
            </div></td>
            {visible.has("tags") && <td className={TABLE_CELL}><Tags tags={item.Tags} /></td>}
            {visible.has("subtasks") && <td className={TABLE_CELL}><SubtaskCountCell count={item.TaskCount} names={item.TaskNames} /></td>}
            {visible.has("difficulty") && <td className={TABLE_CELL}><DifficultyCell average={item.AvgDifficulty} /></td>}
            <td className={TABLE_CELL}><AccessCell item={item} eventName={eventName} /></td>
            <td className={TABLE_CELL}><StatusCell item={item} compact /></td>
            <td className={TABLE_CELL}><AuthorCell name={item.AuthorName} wrap /></td>
            {visible.has("updated") && <td className={TABLE_CELL}><UpdatedCell iso={item.UpdatedAt} /></td>}
          </tr>
          {open && <tr id={detailsId} className="catalog-detail"><td colSpan={columns}><div className="catalog-detail-content">
            {item.Description && <p>{item.Description}</p>}
            <dl><div><dt>{t("admin.ex.col.tags")}</dt><dd><Tags tags={item.Tags} /></dd></div>
              <div><dt>{t("admin.ex.col.subtasks")}</dt><dd><SubtaskCountCell count={item.TaskCount} names={item.TaskNames} /></dd></div>
              <div><dt>{t("admin.ex.col.difficulty")}</dt><dd><DifficultyCell average={item.AvgDifficulty} /></dd></div>
              <div><dt>{t("admin.ex.col.updated")}</dt><dd><UpdatedCell iso={item.UpdatedAt} /></dd></div></dl>
            <OwnershipBadges exercise={item} showAccess={false} showEvent={false} />
            <ResourceHeavyBadge show={item.ResourceHeavy} />
          </div></td></tr>}
        </Fragment>
      })}</tbody>}
    </Table>
  </>
}

function Tags({ tags }: { tags: string[] }) {
  return tags.length ? <span className="catalog-tags">{tags.map((tag) => <span key={tag}>{tag}</span>)}</span> : <span aria-label={t("admin.ex.none")} className="text-muted-foreground">{t("admin.ex.none")}</span>
}
