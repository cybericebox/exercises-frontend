"use client"

import { Check, ChevronLeft, ChevronRight, Lock } from "lucide-react"

import { Button } from "@/components/ui/button"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { t } from "@/i18n/t"
import { cn } from "@/utils/cn"

export type RailTask = {
  id: string
  name: string
  /** flag | text | state | none */
  kind: string
  solved: boolean
  /** Numbers of the tasks it waits for; empty when open. */
  waitsFor: number[]
}

const subtitle = (task: RailTask) => task.waitsFor.length > 0 ? t("ed.d.rail.after", { numbers: task.waitsFor.join(", ") }) : task.kind === "none" ? "" : t(`ed.d.kind.${task.kind}`)

/** The list of tasks at the left (from the medium width up): number, name, kind of check or «після N»; scrolls on its own. */
export function TaskRail({ tasks, selectedId, onSelect }: { tasks: RailTask[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return <aside className="hidden w-60 shrink-0 flex-col overflow-y-auto border-r border-border p-3 md:flex">
    <h2 className="px-1 pb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("ed.d.rail.title", { n: tasks.length })}</h2>
    <nav aria-label={t("ed.d.rail.nav")} className="flex flex-col gap-1">
      {tasks.map((task, index) => {
        const current = task.id === selectedId
        const locked = task.waitsFor.length > 0
        return <button key={task.id} type="button" aria-current={current ? "true" : undefined} onClick={() => onSelect(task.id)}
          className={cn("flex w-full items-start gap-3 rounded-md p-2 text-left text-sm transition-colors hover:bg-muted", current ? "bg-muted text-foreground" : "text-muted-foreground")}>
          <span data-task-number data-state={task.solved ? "solved" : current ? "current" : locked ? "locked" : "todo"}
            className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-semibold",
              task.solved ? "bg-[var(--ib-ok-bg)] text-[var(--ib-ok)]" : current ? "bg-[var(--ib-brand)] text-white" : "bg-secondary/60 text-foreground")}>
            {task.solved ? <Check aria-label={t("ed.d.rail.solved")} size={16} /> : locked ? <Lock aria-hidden="true" size={14} /> : index + 1}
          </span>
          <span className="min-w-0 pt-0.5">
            <span className={cn("block break-words leading-5", current && "font-medium")}>{task.name}</span>
            <span className="block text-xs">{subtitle(task)}</span>
          </span>
        </button>
      })}
    </nav>
  </aside>
}

/** Below the medium width the rail becomes «1 з 3 · Name» with arrows. */
export function TaskSwitcher({ tasks, selectedId, onSelect }: { tasks: RailTask[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const index = Math.max(0, tasks.findIndex((task) => task.id === selectedId))
  const task = tasks[index]
  if (!task) return null
  return <nav aria-label={t("ed.d.rail.nav")} className="flex items-center gap-2 border-b border-border px-3 py-2 md:hidden">
    <HoverTooltip text={t("ed.d.rail.prev")}>
      <Button type="button" variant="ghost" size="icon" aria-label={t("ed.d.rail.prev")} disabled={index === 0} onClick={() => onSelect(tasks[index - 1].id)}><ChevronLeft aria-hidden="true" size={18} /></Button>
    </HoverTooltip>
    <p className="min-w-0 flex-1 truncate text-center text-sm"><span className="text-muted-foreground">{t("ed.d.rail.position", { n: index + 1, total: tasks.length })}</span> · <span className="font-medium text-foreground">{task.name}</span></p>
    <HoverTooltip text={t("ed.d.rail.next")}>
      <Button type="button" variant="ghost" size="icon" aria-label={t("ed.d.rail.next")} disabled={index === tasks.length - 1} onClick={() => onSelect(tasks[index + 1].id)}><ChevronRight aria-hidden="true" size={18} /></Button>
    </HoverTooltip>
  </nav>
}
