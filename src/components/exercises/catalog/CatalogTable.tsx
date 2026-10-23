"use client"

import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from "react"
import Link from "next/link"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import type { ExerciseListItem } from "@/api/exercises/catalog"
import { t } from "@/i18n/t"
import { InfrastructureIcon } from "@/components/exercises/OwnershipBadges"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { Table, TableState } from "@/components/ui/table"
import { COLUMN_SORT, COLUMN_WIDTH, MAX_WIDTH, MIN_WIDTH, NAME_COLUMN, NAME_MAX_WIDTH, NAME_MIN_WIDTH, NAME_WIDTH, clampWidth, type CatalogColumn, type ColumnSetting } from "@/lib/catalogColumns"
import { AccessCell, AuthorCell, DifficultyCell, StatusCell, SubtaskCountCell, UpdatedCell } from "./CatalogCells"
import { columnLabel } from "./ColumnsMenu"
import { cn } from "@/utils/cn"

const SELECT_WIDTH = 44
/** One arrow key press moves the edge by this much (Shift: three times). */
const KEY_STEP = 16

type ResizeKey = CatalogColumn | typeof NAME_COLUMN

/**
 * The right edge of a header cell: drag it (mouse or touch), move it with ←/→ when focused, double-click for the
 * default width. While dragging the width only previews; it is saved once, when the drag ends.
 */
function ResizeHandle({ name, columnKey, width, onPreview, onCommit }: {
  name: string
  columnKey: ResizeKey
  /** The column's width setting (the value the separator reports). */
  width: number
  onPreview: (width: number | null) => void
  onCommit: (width: number | undefined) => void
}) {
  const drag = useRef<{ pointer: number; startX: number; start: number; last: number } | null>(null)
  const name_ = t("exercises.catalog.resizeColumn", { name })
  const [min, max] = columnKey === NAME_COLUMN ? [NAME_MIN_WIDTH, NAME_MAX_WIDTH] : [MIN_WIDTH, MAX_WIDTH]
  // The edge starts from the rendered width (the name may be wider than its setting: it takes the free space).
  const measure = (element: HTMLElement) => element.closest("th")?.getBoundingClientRect().width || width
  function down(event: PointerEvent<HTMLSpanElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const start = clampWidth(columnKey, measure(event.currentTarget))
    drag.current = { pointer: event.pointerId, startX: event.clientX, start, last: start }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  function move(event: PointerEvent<HTMLSpanElement>) {
    const current = drag.current
    if (!current || current.pointer !== event.pointerId) return
    current.last = clampWidth(columnKey, current.start + event.clientX - current.startX)
    onPreview(current.last)
  }
  function up(event: PointerEvent<HTMLSpanElement>) {
    const current = drag.current
    if (!current || current.pointer !== event.pointerId) return
    drag.current = null
    onPreview(null)
    if (current.last !== current.start) onCommit(current.last)
  }
  function key(event: KeyboardEvent<HTMLSpanElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    event.preventDefault()
    const step = (event.shiftKey ? 3 : 1) * KEY_STEP * (event.key === "ArrowLeft" ? -1 : 1)
    onCommit(clampWidth(columnKey, measure(event.currentTarget) + step))
  }
  return <HoverTooltip text={t("exercises.catalog.resizeHint")} className="catalog-col-resize-wrap">
    <span role="separator" aria-orientation="vertical" aria-label={name_} aria-valuenow={Math.round(width)} aria-valuemin={min} aria-valuemax={max} tabIndex={0}
      className="catalog-col-resize" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; onPreview(null) }}
      onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => { event.stopPropagation(); onCommit(undefined) }} onKeyDown={key} />
  </HoverTooltip>
}

type SortProps = { activeField: string; direction: "asc" | "desc"; onSort: (field: string) => void }

/** A header cell; a sortable column shows ↕ on hover/focus and ↑/↓ once it sorts the table. */
function Head({ label, field, sortProps, className, handle }: { label: string; field?: string; sortProps: SortProps; className?: string; handle: ReactNode }) {
  // The header is named by its label alone (not also by its resize handle).
  if (!field) return <th scope="col" aria-label={label} className={cn("catalog-th", className)}><span className="catalog-th-label">{label}</span>{handle}</th>
  const active = sortProps.activeField === field
  const Icon = !active ? ArrowUpDown : sortProps.direction === "asc" ? ArrowUp : ArrowDown
  return <th scope="col" aria-label={label} aria-sort={active ? sortProps.direction === "asc" ? "ascending" : "descending" : "none"} className={cn("catalog-th", active && "catalog-th-on", className)}>
    <button type="button" className="catalog-th-sort" onClick={() => sortProps.onSort(field)}>
      <span className="truncate">{label}</span><Icon aria-hidden="true" className="catalog-sort-icon" />
    </button>
    {handle}
  </th>
}

/** The owner of a task: its event, or the platform catalog. */
function OwnerCell({ item }: { item: ExerciseListItem }) {
  const name = item.Scope === "event" ? item.OwnerEventName || item.OwnerEvent?.Name || t("exercises.badge.event") : t("exercises.owner.catalog")
  return <HoverTooltip text={name} truncated><span className="block truncate">{name}</span></HoverTooltip>
}

function Count({ value, none }: { value: number | null; none: string }) {
  return value === null ? <span aria-label={none} className="text-muted-foreground">—</span> : <span className="tabular-nums">{value}</span>
}

function Tags({ tags }: { tags: string[] }) {
  if (!tags.length) return <span aria-label={t("admin.ex.none")} className="text-muted-foreground">—</span>
  const text = tags.join(", ")
  return <HoverTooltip text={text} truncated><span className="catalog-tags">{tags.map((tag) => <span key={tag}>{tag}</span>)}</span></HoverTooltip>
}

function cell(key: CatalogColumn, item: ExerciseListItem, eventName: (id: string) => string | undefined): ReactNode {
  switch (key) {
    case "access": return <AccessCell item={item} eventName={eventName} />
    case "status": return <StatusCell item={item} compact />
    case "subtasks": return <SubtaskCountCell count={item.TaskCount} names={item.TaskNames} />
    case "variants": return <Count value={item.VariantCount} none={t("exercises.variants.none")} />
    case "author": return <AuthorCell name={item.AuthorName} />
    case "updated": return <UpdatedCell iso={item.UpdatedAt} />
    case "difficulty": return <DifficultyCell average={item.AvgDifficulty} />
    case "tags": return <Tags tags={item.Tags} />
    case "owner": return <OwnerCell item={item} />
  }
}

/**
 * The catalog table: the selection box and the name stay on the left while the other columns (the user's own set
 * and order) scroll sideways. One line per row; long values are cut with an ellipsis and read in full in a tooltip.
 * Loading, empty and error fill the same block, centred.
 */
export function CatalogTable({ rows, columns, nameWidth, onWidth, selected, selecting, selectable, atLimit, allOnPage, pageSelectable, onToggle, onToggleAll, sortProps, eventName, regionRef, busy, state, footer }: {
  rows: ExerciseListItem[]
  columns: ColumnSetting[]
  /** The user's width of «Назва»; absent = default. */
  nameWidth?: number
  /** A column's new width, or `undefined` back to the default (saved with the column settings). */
  onWidth: (key: CatalogColumn | typeof NAME_COLUMN, width: number | undefined) => void
  selected: Map<string, ExerciseListItem>
  selecting: boolean
  selectable: (item: ExerciseListItem) => boolean
  atLimit: boolean
  allOnPage: boolean
  pageSelectable: number
  onToggle: (item: ExerciseListItem) => void
  onToggleAll: () => void
  sortProps: SortProps
  eventName: (id: string) => string | undefined
  regionRef: RefObject<HTMLDivElement | null>
  busy: boolean
  state?: ReactNode
  footer?: ReactNode
}) {
  const visible = columns.filter((column) => column.visible)
  const shown = visible.map((column) => column.key)
  const span = shown.length + (selecting ? 3 : 2)
  // A drag previews its width here and saves once, at the end.
  const [preview, setPreview] = useState<{ key: ResizeKey; width: number } | null>(null)
  const widthOf = (key: ResizeKey) => preview?.key === key ? preview.width
    : key === NAME_COLUMN ? nameWidth ?? NAME_WIDTH : visible.find((column) => column.key === key)?.width ?? COLUMN_WIDTH[key]
  // Every column has exactly its width, so resizing one never moves another. The table is their sum; in a wider
  // block an empty filler column takes the rest (the rows and dividers still span the block), in a narrower one it
  // scrolls sideways (the name and the selection stay). States and long values never move the columns.
  const minWidth = (selecting ? SELECT_WIDTH : 0) + widthOf(NAME_COLUMN) + shown.reduce((sum, key) => sum + widthOf(key), 0)
  const resize = (key: ResizeKey, label: string) => <ResizeHandle name={label} columnKey={key} width={widthOf(key)}
    onPreview={(width) => setPreview(width === null ? null : { key, width })} onCommit={(width) => onWidth(key, width)} />
  return <div className="catalog-table-box">
    <Table label={t("accountMenu.exercises")} regionRef={regionRef} busy={busy} regionClassName="catalog-table" style={{ minWidth }}
      className={cn("catalog-data", selecting && "catalog-has-selection", state && "catalog-data-state")}>
      <colgroup>
        {selecting && <col style={{ width: SELECT_WIDTH }} />}
        <col style={{ width: widthOf(NAME_COLUMN) }} />
        {shown.map((key) => <col key={key} style={{ width: widthOf(key) }} />)}
        <col data-catalog-filler />
      </colgroup>
      <thead><tr>
        {selecting && <th scope="col" className="catalog-th catalog-select"><label className="catalog-check">
          <input type="checkbox" aria-label={t("admin.ex.select.all")} checked={allOnPage} disabled={!pageSelectable} onChange={onToggleAll}
            ref={(input) => { if (input) input.indeterminate = !allOnPage && rows.some((row) => selected.has(row.ID)) }} />
        </label></th>}
        <Head label={columnLabel("name")} field="name" sortProps={sortProps} className="catalog-name" handle={resize(NAME_COLUMN, columnLabel("name"))} />
        {shown.map((key) => <Head key={key} label={columnLabel(key)} field={COLUMN_SORT[key]} sortProps={sortProps} handle={resize(key, columnLabel(key))} />)}
        <td aria-hidden="true" className="catalog-th catalog-filler" />
      </tr></thead>
      {state ? <TableState colSpan={span}>{state}</TableState> : <tbody>{rows.map((item) => {
        const picked = selected.has(item.ID)
        return <tr key={item.ID} className={cn("catalog-row", picked && "catalog-selected", item.ArchivedAt && "catalog-archived")}>
          {selecting && <td className="catalog-select">{selectable(item) && <label className="catalog-check"><input type="checkbox" aria-label={t("admin.ex.select.rowNamed", { name: item.Name })} checked={picked} disabled={!picked && atLimit} onChange={() => onToggle(item)} /></label>}</td>}
          <td className="catalog-name"><div className="catalog-name-content">
            <HoverTooltip text={item.Name} truncated><Link className="catalog-task-link" href={`/detail?id=${item.ID}`}>{item.Name}</Link></HoverTooltip>
            <InfrastructureIcon show={item.Infrastructure} />
          </div></td>
          {shown.map((key) => <td key={key}>{cell(key, item, eventName)}</td>)}
          <td aria-hidden="true" className="catalog-filler" />
        </tr>
      })}</tbody>}
    </Table>
    {footer}
  </div>
}
