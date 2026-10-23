"use client"

import { type ReactNode, type RefObject } from "react"
import Link from "next/link"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import type { ExerciseListItem } from "@/api/exercises/catalog"
import { t } from "@/i18n/t"
import { InfrastructureIcon } from "@/components/exercises/OwnershipBadges"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { Table, TableState } from "@/components/ui/table"
import { COLUMN_SORT, type CatalogColumn, type ColumnSetting } from "@/lib/catalogColumns"
import { AccessCell, AuthorCell, DifficultyCell, StatusCell, SubtaskCountCell, UpdatedCell } from "./CatalogCells"
import { columnLabel } from "./ColumnsMenu"
import { cn } from "@/utils/cn"

type SortProps = { activeField: string; direction: "asc" | "desc"; onSort: (field: string) => void }

/** A header cell; a sortable column shows ↕ on hover/focus and ↑/↓ once it sorts the table. */
function Head({ label, field, sortProps, className }: { label: string; field?: string; sortProps: SortProps; className?: string }) {
  if (!field) return <th scope="col" className={cn("catalog-th", className)}><span className="catalog-th-label">{label}</span></th>
  const active = sortProps.activeField === field
  const Icon = !active ? ArrowUpDown : sortProps.direction === "asc" ? ArrowUp : ArrowDown
  return <th scope="col" aria-sort={active ? sortProps.direction === "asc" ? "ascending" : "descending" : "none"} className={cn("catalog-th", active && "catalog-th-on", className)}>
    <button type="button" className="catalog-th-sort" onClick={() => sortProps.onSort(field)}>
      <span className="truncate">{label}</span><Icon aria-hidden="true" className="catalog-sort-icon" />
    </button>
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
export function CatalogTable({ rows, columns, selected, selecting, selectable, atLimit, allOnPage, pageSelectable, onToggle, onToggleAll, sortProps, eventName, regionRef, busy, state, footer }: {
  rows: ExerciseListItem[]
  columns: ColumnSetting[]
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
  footer: ReactNode
}) {
  const shown = columns.filter((column) => column.visible).map((column) => column.key)
  const span = shown.length + (selecting ? 2 : 1)
  return <div className="catalog-table-box">
    <Table label={t("accountMenu.exercises")} regionRef={regionRef} busy={busy} regionClassName="catalog-table" className={cn("catalog-data", selecting && "catalog-has-selection")}>
      <colgroup>
        {selecting && <col className="catalog-col-select" />}
        <col className="catalog-col-name" />
        {shown.map((key) => <col key={key} className={`catalog-col-${key}`} />)}
      </colgroup>
      <thead><tr>
        {selecting && <th scope="col" className="catalog-th catalog-select"><label className="catalog-check">
          <input type="checkbox" aria-label={t("admin.ex.select.all")} checked={allOnPage} disabled={!pageSelectable} onChange={onToggleAll}
            ref={(input) => { if (input) input.indeterminate = !allOnPage && rows.some((row) => selected.has(row.ID)) }} />
        </label></th>}
        <Head label={columnLabel("name")} field="name" sortProps={sortProps} className="catalog-name" />
        {shown.map((key) => <Head key={key} label={columnLabel(key)} field={COLUMN_SORT[key]} sortProps={sortProps} />)}
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
        </tr>
      })}</tbody>}
    </Table>
    {footer}
  </div>
}
