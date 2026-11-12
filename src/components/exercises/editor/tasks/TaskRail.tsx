"use client"

import { Activity, ArrowDown, ArrowUp, ChevronDown, Ellipsis, FileText, Flag, Plus, Trash2 } from "lucide-react"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { pluralKey } from "@/lib/presetLabels"
import type { TaskFormValues } from "@/lib/editor/schemas/task"
import { checkChoiceOf, type CheckChoice } from "./taskShared"

const KIND_ICON = { flag: Flag, text: FileText, state: Activity } as const

export const kindLabel = (choice: CheckChoice) => t(`ed.b.kind.${choice}`)

/** «Прапор · після 1, 2» — the second line of a rail item. */
export function railMeta(task: TaskFormValues, tasks: TaskFormValues[]): string {
  const after = task.Requires.map((key) => tasks.findIndex((candidate) => candidate.Key === key) + 1).filter((n) => n > 0)
  const kind = kindLabel(checkChoiceOf(task))
  return after.length ? `${kind} · ${t("ed.b.rail.after", { list: after.join(", ") })}` : kind
}

const taskName = (task: TaskFormValues, index: number) => task.Name.trim() || t("ed.b.rail.numbered", { n: index + 1 })

/**
 * The rail of the subtasks (D1): number, name (the full name in a tooltip), kind of check and «після N». It does not scroll
 * with the form. On a phone it is one picker. Actions (order, removal) show on hover or focus.
 */
export function TaskRail({ rows, selected, onSelect, editable, phone, onAdd, onMove, onRemove }: {
  rows: TaskFormValues[]
  selected: number
  onSelect: (index: number) => void
  editable: boolean
  phone: boolean
  onAdd: () => void
  onMove: (from: number, to: number) => void
  onRemove: (index: number) => void
}) {
  if (phone) {
    const current = rows[selected]
    return <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="subtasks-picker" aria-label={t("ed.b.rail.pick", { n: selected + 1, name: current ? taskName(current, selected) : "" })}>
          <span className="min-w-0 flex-1 truncate">{t("ed.b.rail.pickerValue", { n: selected + 1, name: current ? taskName(current, selected) : "" })}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{t(pluralKey("ed.b.rail.count", rows.length), { count: rows.length })}</span>
          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[60dvh] w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto">
        <DropdownMenuRadioGroup value={String(selected)} onValueChange={(value) => onSelect(Number(value))}>
          {rows.map((task, index) => <DropdownMenuRadioItem key={task.Key || index} value={String(index)}>{t("ed.b.rail.pickerValue", { n: index + 1, name: taskName(task, index) })}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
        {editable && <>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-2" onSelect={onAdd}><Plus aria-hidden="true" className="h-4 w-4" />{t("ed.b.rail.add")}</DropdownMenuItem>
        </>}
      </DropdownMenuContent>
    </DropdownMenu>
  }
  return <nav aria-label={t("ed.b.rail.aria")} className="subtasks-rail" data-testid="task-rail">
    <div className="subtasks-rail-head"><h3>{t("ed.b.rail.title", { count: rows.length })}</h3></div>
    <ul>
      {rows.map((task, index) => {
        const Icon = KIND_ICON[checkChoiceOf(task)]
        const meta = railMeta(task, rows)
        return <li key={task.Key || index} className="subtasks-item">
          <HoverTooltip text={taskName(task, index)} truncated className="subtasks-tip">
            <button type="button" className="subtasks-btn" aria-current={index === selected ? "page" : undefined} onClick={() => onSelect(index)} aria-label={`${taskName(task, index)}. ${meta}`}>
              <span className="subtasks-num" aria-hidden="true">{index + 1}</span>
              <span className="subtasks-text">
                <span className="truncate">{task.Name.trim() || <span className="text-placeholder">{t("ed.b.unnamed")}</span>}</span>
                <span className="subtasks-meta truncate"><Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />{meta}</span>
              </span>
            </button>
          </HoverTooltip>
          {editable && <span className="subtasks-remove">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={t("ed.b.rail.actions")} aria-haspopup="menu"><Ellipsis aria-hidden="true" className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem className="gap-2" disabled={index === 0} onSelect={() => onMove(index, index - 1)}><ArrowUp aria-hidden="true" className="h-4 w-4" />{t("ed.b.rail.moveUp")}</DropdownMenuItem>
                <DropdownMenuItem className="gap-2" disabled={index === rows.length - 1} onSelect={() => onMove(index, index + 1)}><ArrowDown aria-hidden="true" className="h-4 w-4" />{t("ed.b.rail.moveDown")}</DropdownMenuItem>
                {rows.length > 1 && <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" onSelect={() => onRemove(index)}><Trash2 aria-hidden="true" className="h-4 w-4" />{t("ed.b.rail.remove")}</DropdownMenuItem>
                </>}
              </DropdownMenuContent>
            </DropdownMenu>
          </span>}
        </li>
      })}
    </ul>
    {editable && <button type="button" className="rail-add" onClick={onAdd}><Plus aria-hidden="true" className="h-4 w-4" />{t("ed.b.rail.add")}</button>}
  </nav>
}
