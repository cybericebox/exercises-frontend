"use client"

import { useEffect, useState, type ReactNode } from "react"
import { Check, ChevronsLeft, ChevronsRight, Download, Eye, LogOut, Network, Shield, ShieldCheck } from "lucide-react"

import { exerciseFileURL } from "@/api/exercises/files"
import type { NormalizedHint, NormalizedTask } from "@/api/exercises/versions"
import { TaskRichTextView, richTextHasBlocks } from "@/components/exercises/TaskRichTextView"
import { TestFlagCheck } from "@/components/exercises/TestFlagCheck"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { t } from "@/i18n/t"
import { hintTextHasContent, hintTextToState } from "@/lib/hintText"
import type { ExternalTarget, TaskValues } from "@/lib/placeholderResolve"
import { cn } from "@/utils/cn"

/**
 * The lab workbench: a bar on top, a collapsible task sidebar on the left and the
 * chosen task as a participant sees it. Presentational only, so the test page and a
 * later lab-work mode can both mount it (the topology panel is mounted by the page).
 */

const BAR_BUTTON = "border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"

/** "1:42:10" — time left; never negative. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

/** The lab's countdown, centered in the bar; `fallback` reads instead until the lease is known. */
export function LabTimer({ expiresAt, fallback }: { expiresAt: string | null; fallback: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!expiresAt) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [expiresAt])
  if (!expiresAt) return <span className="text-sm text-white/80">{fallback}</span>
  const left = new Date(expiresAt).getTime() - now
  return left > 0
    ? <span role="timer" className="text-sm text-white"><span className="font-mono text-base font-semibold tabular-nums">{formatCountdown(left)}</span> · {t("admin.exTest.timerAvailable")}</span>
    : <span role="timer" className="text-sm text-white">{t("admin.exTest.timerEnded")}</span>
}

export type LabBarProps = {
  title: string
  progress: { done: number; total: number }
  /** The middle of the bar: usually a LabTimer. */
  center: ReactNode
  topologyShown?: boolean
  onToggleTopology?: () => void
  onDownloadVpn?: () => void
  /** Whether the author's VPN is connected to this lab; `lastHandshake` is the ISO time of the last exchange. */
  vpn?: { connected: boolean; lastHandshake?: string }
  onEnd?: () => void
}

/** "12:03:07" in the viewer's own time. */
function clockTime(iso: string): string {
  const at = new Date(iso)
  return [at.getHours(), at.getMinutes(), at.getSeconds()].map((part) => String(part).padStart(2, "0")).join(":")
}

function vpnTooltip(vpn: LabBarProps["vpn"]): string {
  return vpn?.connected
    ? t("admin.exTest.vpnConnected", { time: vpn.lastHandshake ? clockTime(vpn.lastHandshake) : "" })
    : t("admin.exTest.vpnDisconnected")
}

/** One bar in brand navy: what is being worked on and how far, the lab clock, and the lab's actions. */
export function LabBar({ title, progress, center, topologyShown = false, onToggleTopology, onDownloadVpn, vpn, onEnd }: LabBarProps) {
  const percent = progress.total ? Math.round(progress.done / progress.total * 100) : 0
  return (
    <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 bg-[var(--ib-brand)] px-4 py-3 text-white">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs uppercase tracking-wider text-white/70">{t("admin.exTest.caption")}</span>
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="min-w-0 truncate text-base font-semibold">{title}</h1>
          <div className="flex shrink-0 items-center gap-2 text-xs text-white/80"
            aria-label={t("admin.exTest.progressLabel", { done: progress.done, total: progress.total })}>
            <span aria-hidden="true" className="h-1.5 w-24 overflow-hidden rounded-full bg-white/25">
              <span className="block h-full rounded-full bg-white" style={{ width: `${percent}%` }} />
            </span>
            <span aria-hidden="true" className="tabular-nums">{progress.done} / {progress.total}</span>
          </div>
        </div>
      </div>
      <div className="flex justify-center">{center}</div>
      <div className="flex items-center justify-end gap-2">
        {onToggleTopology && <HoverTooltip text={t(topologyShown ? "admin.exTest.topologyHide" : "admin.exTest.topologyShow")}>
          <Button type="button" variant="outline" size="sm" className={cn(BAR_BUTTON, "w-9 px-0", topologyShown && "bg-white/20")} aria-pressed={topologyShown}
            aria-label={t(topologyShown ? "admin.exTest.topologyHide" : "admin.exTest.topologyShow")} onClick={onToggleTopology}>
            <Network aria-hidden="true" size={16} />
          </Button>
        </HoverTooltip>}
        {onDownloadVpn && <HoverTooltip text={vpnTooltip(vpn)}>
          <Button type="button" variant="outline" size="sm" className={BAR_BUTTON} aria-label={t("admin.exTest.vpnDownload")} aria-describedby="lab-vpn-state" data-vpn={vpn?.connected ? "connected" : "disconnected"} onClick={onDownloadVpn}>
            {vpn?.connected
              ? <ShieldCheck aria-hidden="true" size={16} className="mr-1.5 fill-emerald-400/40 text-emerald-300" />
              : <Shield aria-hidden="true" size={16} className="mr-1.5 text-white/60" />}
            {t("admin.exTest.vpnShort")}
            <span id="lab-vpn-state" hidden>{vpnTooltip(vpn)}</span>
          </Button>
        </HoverTooltip>}
        {onEnd && <HoverTooltip text={t("admin.exTest.end")}>
          <Button type="button" variant="destructive" size="sm" className="w-9 px-0" aria-label={t("admin.exTest.end")} onClick={onEnd}>
            <LogOut aria-hidden="true" size={16} />
          </Button>
        </HoverTooltip>}
      </div>
    </header>
  )
}

/** Sidebar with every task: number badge (grey, navy when current, green ✓ when solved) and the whole title. */
export function TaskSidebar({ tasks, selectedId, solved, collapsed, onToggle, onSelect }: {
  tasks: NormalizedTask[]
  selectedId: string | null
  solved: ReadonlySet<string>
  collapsed: boolean
  onToggle: () => void
  onSelect: (id: string) => void
}) {
  const label = t(collapsed ? "admin.exTest.sidebarExpand" : "admin.exTest.sidebarCollapse")
  return (
    <aside data-collapsed={collapsed} className={cn("flex shrink-0 flex-col gap-2 overflow-y-auto border-r border-border p-3", collapsed ? "w-[72px]" : "w-[272px]")}>
      <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-between")}>
        {!collapsed && <h2 className="px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("admin.exTest.tasksCount", { n: tasks.length })}</h2>}
        <HoverTooltip text={label}>
          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={label} aria-expanded={!collapsed} onClick={onToggle}>
            {collapsed ? <ChevronsRight aria-hidden="true" size={16} /> : <ChevronsLeft aria-hidden="true" size={16} />}
          </Button>
        </HoverTooltip>
      </div>
      <nav aria-label={t("admin.exTest.tasks")} className="flex flex-col gap-1">
        {tasks.map((entry, index) => {
          const current = entry.ID === selectedId
          const done = solved.has(entry.ID)
          return (
            <HoverTooltip key={entry.ID || index} text={entry.Name} className="w-full">
            <button type="button" aria-current={current ? "true" : undefined} aria-label={entry.Name}
              onClick={() => onSelect(entry.ID)}
              className={cn("flex w-full items-start gap-3 rounded-md p-2 text-left text-sm transition-colors hover:bg-muted", collapsed && "justify-center", current ? "text-foreground" : "text-muted-foreground")}>
              <span data-task-number data-state={done ? "solved" : current ? "current" : "todo"}
                className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-semibold",
                  done ? "bg-[var(--ib-ok-bg)] text-[var(--ib-ok)]" : current ? "bg-[var(--ib-brand)] text-white" : "bg-secondary/60 text-foreground")}>
                {done ? <Check aria-label={t("admin.exTest.solved")} size={16} /> : index + 1}
              </span>
              {!collapsed && <span className={cn("min-w-0 break-words pt-1", current && "font-medium")}>{entry.Name}</span>}
            </button>
            </HoverTooltip>
          )
        })}
      </nav>
    </aside>
  )
}

const HEADING = "text-xs font-medium uppercase tracking-wider text-muted-foreground"

/**
 * Hints of a task in catalog order, each collapsed as «Підказка N · level» with «Показати».
 * `onUnlock` lets a mode with paid hints gate the reveal (true = reveal); `cost` labels the row.
 */
export function HintList({ hints, revealed, onReveal, render, onUnlock, cost }: {
  hints: { hint: NormalizedHint; index: number }[]
  revealed: ReadonlySet<string>
  onReveal: (key: string) => void
  render: (text: string) => ReactNode
  onUnlock?: (hint: NormalizedHint) => Promise<boolean> | boolean
  cost?: (hint: NormalizedHint) => string | null
}) {
  const [busy, setBusy] = useState<string | null>(null)
  async function show(key: string, hint: NormalizedHint) {
    if (onUnlock) {
      setBusy(key)
      try { if (!(await onUnlock(hint))) return } finally { setBusy(null) }
    }
    onReveal(key)
  }
  return <section>
    <h3 className={HEADING}>{t("exercises.hints.title")}</h3>
    <ol className="mt-2 space-y-2">
      {hints.map(({ hint, index }) => {
        const key = hint.ID || String(index)
        const open = revealed.has(key)
        const price = cost?.(hint)
        return <li key={key} className="rounded-md border border-border p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground">{t("exercises.hints.item", { n: index + 1 })} · {t(`exercises.hints.level.${hint.Level}`)}{price ? ` · ${price}` : ""}</span>
            {!open && <HoverTooltip text={t("admin.exTest.hintShow")}>
              <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0" busy={busy === key} disabled={busy !== null}
                aria-label={t("admin.exTest.hintShowNamed", { n: index + 1 })} onClick={() => void show(key, hint)}>
                <Eye aria-hidden="true" size={16} />
              </Button>
            </HoverTooltip>}
          </div>
          {open && <div className="mt-2">{render(hint.Text)}</div>}
        </li>
      })}
    </ol>
  </section>
}

/** The chosen task: title, difficulty, description with the lab's values, files, hints, the answer card and the stage links. */
export function TaskView({ task, values, deployId, flagLinked, solved = false, openingKey, onOpenExternal, onSolved, revealedHints, onRevealHint, onUnlockHint, hintCost, prev, next }: {
  task: NormalizedTask
  values: TaskValues
  deployId: string
  flagLinked: boolean
  /** The answer was already checked correctly (kept with the deploy). */
  solved?: boolean
  openingKey: string | null
  onOpenExternal: (target: ExternalTarget) => void
  onSolved: (taskId: string) => void
  revealedHints: ReadonlySet<string>
  onRevealHint: (key: string) => void
  onUnlockHint?: (hint: NormalizedHint) => Promise<boolean> | boolean
  hintCost?: (hint: NormalizedHint) => string | null
  /** The neighbouring stages: {number, select}. */
  prev?: { number: number; select: () => void }
  next?: { number: number; select: () => void }
}) {
  const hints = task.Hints.map((hint, index) => ({ hint, index })).filter(({ hint }) => hintTextHasContent(hint.Text))
  const view = (value: unknown): ReactNode => <TaskRichTextView value={value} variables={values.variables} links={values.links}
    external={values.external} openingKey={openingKey} onOpenExternal={onOpenExternal} />
  const scoped = (hintKey: string) => `${task.ID}:${hintKey}`
  const scopedRevealed = new Set([...revealedHints].filter((k) => k.startsWith(`${task.ID}:`)).map((k) => k.slice(task.ID.length + 1)))
  return <article className="min-w-0 max-w-[820px] space-y-6">
    <header className="flex flex-wrap items-center gap-2.5">
      <h2 className="text-2xl font-semibold text-foreground">{task.Name}</h2>
      <Badge tone="muted">{t(`admin.ex.difficulty.${task.Difficulty}`)}</Badge>
    </header>

    <div>{richTextHasBlocks(task.Description) ? view(task.Description) : <p className="text-sm text-muted-foreground">{t("admin.exTest.noDescription")}</p>}</div>

    {task.Attachments.length > 0 && <section>
      <h3 className={HEADING}>{t("admin.exTest.attachments")}</h3>
      <ul className="mt-2 space-y-1.5">
        {task.Attachments.map((file) => <li key={file.FileID} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
          <span className="min-w-0 truncate">{file.Name}</span>
          <HoverTooltip text={t("admin.exTest.download")}>
            <a href={exerciseFileURL(file.FileID)} download={file.Name} aria-label={`${t("admin.exTest.download")} ${file.Name}`}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-primary hover:bg-muted"><Download aria-hidden="true" size={16} /></a>
          </HoverTooltip>
        </li>)}
      </ul>
    </section>}

    {flagLinked && deployId && <section className="rounded-lg border border-border bg-muted/30 p-4">
      <h3 className="mb-2 text-sm font-semibold text-foreground">{t("admin.exTest.flagTitle")}</h3>
      <TestFlagCheck deployId={deployId} taskId={task.ID} taskName={task.Name} solved={solved} onResult={(correct) => { if (correct) onSolved(task.ID) }} />
    </section>}

    {hints.length > 0 && <HintList hints={hints} revealed={scopedRevealed} onReveal={(key) => onRevealHint(scoped(key))}
      render={(text) => view(hintTextToState(text))} onUnlock={onUnlockHint} cost={hintCost} />}

    {(prev || next) && <nav aria-label={t("admin.exTest.stages")} className="flex items-center justify-between gap-3 border-t border-border pt-4">
      {prev ? <Button type="button" variant="outline" onClick={prev.select}>{t("admin.exTest.stagePrev", { n: prev.number })}</Button> : <span />}
      {next ? <Button type="button" variant="outline" onClick={next.select}>{t("admin.exTest.stageNext", { n: next.number })}</Button> : <span />}
    </nav>}
  </article>
}
