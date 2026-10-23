"use client"

import { useRef, useState, type DragEvent, type KeyboardEvent } from "react"
import { ChevronDown, ChevronUp, Columns3, GripVertical, Lock } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { t } from "@/i18n/t"
import { DEFAULT_COLUMNS, isDefaultColumns, moveColumn, toggleColumn, type ColumnSetting } from "@/lib/catalogColumns"
import { cn } from "@/utils/cn"

export const columnLabel = (key: string) => t(`admin.ex.col.${key}`)

/**
 * «Колонки»: show or hide each column and put them in order. A row moves by dragging, by its arrows, or with
 * Alt+↑/↓ while it has focus; the new position is announced. The name column is always first.
 */
export function ColumnsMenu({ columns, onChange }: { columns: ColumnSetting[]; onChange: (columns: ColumnSetting[]) => void }) {
  const [announcement, setAnnouncement] = useState("")
  const [dragging, setDragging] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const rows = useRef<(HTMLLIElement | null)[]>([])

  function move(from: number, to: number, focus = false) {
    const next = moveColumn(columns, from, to)
    if (next === columns) return
    onChange(next)
    const position = next.findIndex((column) => column.key === columns[from].key)
    setAnnouncement(t("exercises.catalog.columnMoved", { name: columnLabel(columns[from].key), position: position + 2 }))
    if (focus) requestAnimationFrame(() => rows.current[position]?.focus())
  }

  function onKeyDown(event: KeyboardEvent<HTMLLIElement>, index: number) {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return
    event.preventDefault()
    move(index, index + (event.key === "ArrowUp" ? -1 : 1), true)
  }

  function onDrop(event: DragEvent, index: number) {
    event.preventDefault()
    if (dragging !== null) move(dragging, index)
    setDragging(null)
    setOver(null)
  }

  const label = t("exercises.catalog.columns")
  return <Popover>
    <HoverTooltip text={label}>
      <PopoverTrigger asChild>
        <button type="button" className="catalog-tool" aria-label={label}><Columns3 aria-hidden="true" /></button>
      </PopoverTrigger>
    </HoverTooltip>
    <PopoverContent align="end" className="w-72 p-1.5" aria-label={label}>
      <div className="flex items-center justify-between px-2 pb-1 pt-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        {!isDefaultColumns(columns) && <button type="button" className="catalog-link-btn" onClick={() => { onChange(DEFAULT_COLUMNS.map((column) => ({ ...column }))); setAnnouncement(t("exercises.catalog.columnsReset")) }}>{t("exercises.catalog.columnsReset")}</button>}
      </div>
      <div className="catalog-opt text-muted-foreground"><Lock aria-hidden="true" className="h-4 w-4" /><span className="flex-1">{columnLabel("name")}</span><span className="text-xs">{t("exercises.catalog.nameFirst")}</span></div>
      <ul aria-label={label}>
        {columns.map((column, index) => <li key={column.key} ref={(node) => { rows.current[index] = node }} tabIndex={-1}
          draggable onDragStart={(event) => { setDragging(index); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", column.key) }}
          onDragOver={(event) => { if (dragging !== null) { event.preventDefault(); setOver(index) } }} onDragLeave={() => setOver(null)}
          onDrop={(event) => onDrop(event, index)} onDragEnd={() => { setDragging(null); setOver(null) }}
          onKeyDown={(event) => onKeyDown(event, index)}
          className={cn("catalog-opt catalog-col-row", dragging === index && "opacity-50", over === index && dragging !== index && "catalog-drop-target")}>
          <GripVertical aria-hidden="true" className="catalog-grip" />
          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
            <input type="checkbox" checked={column.visible} onChange={() => onChange(toggleColumn(columns, column.key))}
              aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" />
            <span className="truncate">{columnLabel(column.key)}</span>
          </label>
          <span className="catalog-row-act flex">
            <HoverTooltip text={t("exercises.catalog.columnUp")}>
              <button type="button" className="catalog-icon" disabled={index === 0} aria-label={t("exercises.catalog.columnUpNamed", { name: columnLabel(column.key) })} onClick={() => move(index, index - 1)}><ChevronUp aria-hidden="true" /></button>
            </HoverTooltip>
            <HoverTooltip text={t("exercises.catalog.columnDown")}>
              <button type="button" className="catalog-icon" disabled={index === columns.length - 1} aria-label={t("exercises.catalog.columnDownNamed", { name: columnLabel(column.key) })} onClick={() => move(index, index + 1)}><ChevronDown aria-hidden="true" /></button>
            </HoverTooltip>
          </span>
        </li>)}
      </ul>
      <p className="px-2 pb-1 pt-1.5 text-xs text-muted-foreground">{t("exercises.catalog.columnsHint")}</p>
      <span className="sr-only" aria-live="polite">{announcement}</span>
    </PopoverContent>
  </Popover>
}
