"use client"

import type { ReactNode } from "react"
import { Check } from "lucide-react"

import { exerciseFileURL } from "@/api/exercises/files"
import type { NormalizedTask } from "@/api/exercises/versions"
import { TaskRichTextView, richTextHasBlocks } from "@/components/exercises/TaskRichTextView"
import { TestFlagCheck } from "@/components/exercises/TestFlagCheck"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { hintTextHasContent, hintTextToState } from "@/lib/hintText"
import type { ExternalTarget, TaskValues } from "@/lib/placeholderResolve"
import { cn } from "@/utils/cn"

/**
 * The lab workbench: a lab bar on top, the task list with the lab's web access on the
 * left and the chosen task on the right, as a participant sees it. Presentational
 * only, so the test page and a later lab-work mode can both mount it.
 */

const BAR_BUTTON = "border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"

export type LabBarProps = {
  title: string
  subtitle: string
  /** «Лабораторія готова · до 15:00», already localized. */
  status: string
  statusTone: "ok" | "warn" | "muted"
  onDownloadVpn?: () => void
  onEnd?: () => void
}

/** Full-width bar in brand navy: what is being tested, the lab state and its actions. */
export function LabBar({ title, subtitle, status, statusTone, onDownloadVpn, onEnd }: LabBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-lg bg-[var(--ib-brand)] px-5 py-4 text-white">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="truncate text-xl font-semibold">{title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-white/75">
          <span>{subtitle}</span>
          <Badge tone={statusTone} data-deploy-status>{status}</Badge>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onDownloadVpn && <Button type="button" variant="outline" className={BAR_BUTTON} onClick={onDownloadVpn}>{t("admin.exTest.vpnDownload")}</Button>}
        {onEnd && <Button type="button" variant="destructive" onClick={onEnd}>{t("admin.exTest.end")}</Button>}
      </div>
    </div>
  )
}

export type WebAccessItem = { key: string; device: string; busy: boolean }

/** The task list (numbered, ✓ once solved) and, at the bottom, one «Відкрити» per web device. */
export function TaskList({ tasks, selectedId, solved, onSelect, webAccess, webBusy, onOpenWeb }: {
  tasks: NormalizedTask[]
  selectedId: string | null
  solved: ReadonlySet<string>
  onSelect: (id: string) => void
  webAccess: WebAccessItem[]
  webBusy: boolean
  onOpenWeb: (key: string) => void
}) {
  return (
    <aside className="flex min-h-0 flex-col justify-between gap-6 rounded-lg border border-border p-3">
      <nav aria-label={t("admin.exTest.tasks")} className="flex flex-col gap-1">
        <h2 className="px-2 pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("admin.exTest.tasksCount", { n: tasks.length })}</h2>
        {tasks.map((entry, index) => {
          const current = entry.ID === selectedId
          const done = solved.has(entry.ID)
          return (
            <button key={entry.ID || index} type="button" aria-current={current ? "true" : undefined} onClick={() => onSelect(entry.ID)}
              className={cn("flex items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted", current ? "bg-muted font-medium text-foreground" : "text-muted-foreground")}>
              <span data-task-number className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold",
                done ? "bg-[var(--ib-ok-bg)] text-[var(--ib-ok)]" : "bg-secondary/60 text-foreground")}>
                {done ? <Check aria-label={t("admin.exTest.solved")} size={14} /> : index + 1}
              </span>
              <span className="min-w-0 break-words">{entry.Name}</span>
            </button>
          )
        })}
      </nav>
      {webAccess.length > 0 && (
        <section aria-label={t("admin.exTest.webAccess")} className="flex flex-col gap-1 border-t border-border pt-3">
          <h2 className="px-2 pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("admin.exTest.webAccess")}</h2>
          {webAccess.map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-2 px-2 text-sm">
              <span className="min-w-0 truncate text-foreground">{item.device}</span>
              <Button type="button" variant="outline" size="sm" busy={item.busy} disabled={webBusy}
                aria-label={t("admin.exTest.openWeb", { device: item.device })} onClick={() => onOpenWeb(item.key)}>{t("admin.exDeploy.open")}</Button>
            </div>
          ))}
        </section>
      )}
    </aside>
  )
}

const HEADING = "text-xs font-medium uppercase tracking-wider text-muted-foreground"

/** The chosen task: title, difficulty, description with the lab's values, files, hints and the answer card. */
export function TaskView({ task, values, deployId, flagLinked, openingKey, onOpenExternal, onSolved }: {
  task: NormalizedTask
  values: TaskValues
  deployId: string
  flagLinked: boolean
  openingKey: string | null
  onOpenExternal: (target: ExternalTarget) => void
  onSolved: (taskId: string) => void
}) {
  const hints = task.Hints.filter((hint) => hintTextHasContent(hint.Text))
  const view = (value: unknown): ReactNode => <TaskRichTextView value={value} variables={values.variables} links={values.links}
    external={values.external} openingKey={openingKey} onOpenExternal={onOpenExternal} />
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
          <a href={exerciseFileURL(file.FileID)} download={file.Name} aria-label={`${t("admin.exTest.download")} ${file.Name}`} className="shrink-0 text-primary underline underline-offset-2">{t("admin.exTest.download")}</a>
        </li>)}
      </ul>
    </section>}

    {hints.length > 0 && <section>
      <h3 className={HEADING}>{t("exercises.hints.title")}</h3>
      <ol className="mt-2 space-y-2">
        {hints.map((hint, index) => <li key={hint.ID || index} className="rounded-md border border-border p-3">
          <div className="mb-1 text-xs text-muted-foreground">{t("exercises.hints.item", { n: index + 1 })} · {t(`exercises.hints.level.${hint.Level}`)}</div>
          {view(hintTextToState(hint.Text))}
        </li>)}
      </ol>
    </section>}

    {flagLinked && deployId && <section className="rounded-lg border border-border bg-muted/30 p-4">
      <h3 className="text-sm font-semibold text-foreground">{t("admin.exTest.flagTitle")}</h3>
      <p className="mb-2 mt-0.5 text-xs text-muted-foreground">{t("admin.exDeploy.checkHelp")}</p>
      <TestFlagCheck deployId={deployId} taskId={task.ID} taskName={task.Name} onResult={(correct) => { if (correct) onSolved(task.ID) }} />
    </section>}
  </article>
}
