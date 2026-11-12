"use client"

import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react"
import type { ImportDiffDevice, ImportDiffTask, ImportDiffVariant, ImportReport, ImportWarning } from "@/api/exercises/archiveImport"
import { t } from "@/i18n/t"
import "@/styles/editor-a.css"
import { pluralKey } from "@/lib/presetLabels"
import { cn } from "@/utils/cn"

const STATUS_TONE: Record<ImportDiffVariant["Status"], string> = {
  kept: "bg-muted text-muted-foreground",
  added: "bg-[var(--ib-ok-bg)] text-[var(--ib-ok)]",
  removed: "bg-[var(--ib-warn-bg)] text-[var(--ib-warn)]",
}

/** The text of a warning of the report; an unknown code falls back to its code, never to nothing. */
export function warningText(warning: ImportWarning): string {
  const context = warning.Context ?? {}
  switch (warning.Code) {
    case "no_exercise_id": return t("ed.a.import.warn.noExerciseId")
    case "task_key_conflict": return t("ed.a.import.warn.keyConflict", { task: String(context.task ?? ""), key: String(context.key ?? "") })
    case "used_by_events": return t(pluralKey("ed.a.import.warn.usedByEvents", Number(context.events ?? 0)), { count: Number(context.events ?? 0) })
    case "removed_task_has_attempts": return t("ed.a.import.warn.removedHasAttempts", { event: String(context.event ?? ""), task: String(context.task ?? ""), attempts: Number(context.attempts ?? 0), solves: Number(context.solves ?? 0) })
    case "running_labs": return t(pluralKey("ed.a.import.warn.runningLabs", Number(context.labs ?? 0)), { count: Number(context.labs ?? 0) })
    default: return t("ed.a.import.warn.other", { code: warning.Code })
  }
}

function Names({ items, tone, label }: { items: (ImportDiffTask | ImportDiffDevice)[]; tone: "added" | "removed" | "kept"; label: string }) {
  if (items.length === 0) return null
  return <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
    <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", STATUS_TONE[tone])}>{label}</span>
    {items.map((item, index) => <span key={`${item.Name}-${index}`} className="text-sm">
      {item.Name}{"PreviousName" in item && item.PreviousName && item.PreviousName !== item.Name && <span className="text-muted-foreground"> ({t("ed.a.import.renamed", { name: item.PreviousName })})</span>}
      {"KeyChanged" in item && item.KeyChanged && <span className="text-[var(--ib-warn)]"> · {t("ed.a.import.keyChanged")}</span>}
    </span>)}
  </li>
}

function VariantDiff({ variant }: { variant: ImportDiffVariant }) {
  const title = variant.Status === "removed"
    ? t("ed.a.import.variantStored", { n: variant.StoredPosition })
    : t("ed.a.import.variantN", { n: variant.Position })
  const tasks = variant.Tasks, devices = variant.Devices
  const empty = [tasks.Kept, tasks.Added, tasks.Removed, devices.Kept, devices.Added, devices.Removed].every((list) => list.length === 0)
  return <section aria-label={title} data-diff-variant={variant.Status} className="rounded-md border border-border">
    <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
      <h4 className="text-sm font-medium text-foreground">{title}</h4>
      <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", STATUS_TONE[variant.Status])}>{t(`ed.a.import.status.${variant.Status}`)}</span>
      {variant.Status === "kept" && variant.MatchedBy && <span className="text-xs text-muted-foreground">{t(`ed.a.import.matched.${variant.MatchedBy}`, { n: variant.StoredPosition })}</span>}
    </header>
    {!empty && <div className="grid gap-3 px-3 py-2 sm:grid-cols-2">
      <div><h5 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("ed.a.variants.tasks")}</h5>
        <ul className="flex flex-col gap-1">
          <Names items={tasks.Added} tone="added" label={t("ed.a.import.added")} />
          <Names items={tasks.Removed} tone="removed" label={t("ed.a.import.removed")} />
          <Names items={tasks.Kept} tone="kept" label={t("ed.a.import.kept")} />
        </ul></div>
      <div><h5 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("ed.a.variants.devices")}</h5>
        <ul className="flex flex-col gap-1">
          <Names items={devices.Added} tone="added" label={t("ed.a.import.added")} />
          <Names items={devices.Removed} tone="removed" label={t("ed.a.import.removed")} />
          <Names items={devices.Kept} tone="kept" label={t("ed.a.import.kept")} />
        </ul></div>
    </div>}
  </section>
}

/** The one-line verdict of a report: publishable, or how many issues block publishing. */
export function ReportVerdict({ report }: { report: ImportReport }) {
  return report.Publishable
    ? <span className="inline-flex items-center gap-1 text-xs text-[var(--ib-ok)]"><CircleCheck aria-hidden="true" className="h-3.5 w-3.5" />{t("ed.a.import.publishable")}</span>
    : <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--ib-warn)]"><TriangleAlert aria-hidden="true" className="h-3.5 w-3.5" />{t(pluralKey("ed.a.import.issuesCount", report.Issues.length), { count: report.Issues.length })}</span>
}

/**
 * What an import brings, read from the `Report` of the preview or of the result: the diff per variant (what is kept,
 * added or removed), the issues that block publishing, the warnings, and what the events that use the exercise lose.
 */
export function ImportReportView({ report, showVerdict = true }: { report: ImportReport; showVerdict?: boolean }) {
  const events = report.Usage?.Events ?? []
  return <div className="flex flex-col gap-3" data-import-report>
    <div className="flex flex-wrap items-center gap-3">{showVerdict && <ReportVerdict report={report} />}
      {(report.Usage?.TestDeploys ?? 0) > 0 && <span className="text-xs text-muted-foreground">{t(pluralKey("ed.a.import.testDeploys", report.Usage?.TestDeploys ?? 0), { count: report.Usage?.TestDeploys ?? 0 })}</span>}</div>
    {report.Issues.length > 0 && <div>
      <h4 className="mb-1 text-sm font-medium text-foreground">{t("ed.a.import.blocks")}</h4>
      <ul className="flex flex-col gap-1.5">
        {report.Issues.map((issue, index) => <li key={`${issue.Code}-${index}`} className="flex items-start gap-2 text-sm">
          <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <span className="min-w-0"><span>{issue.Message}</span>{issue.Path && <code className="ml-2 break-all font-mono text-xs text-muted-foreground">{issue.Path}</code>}</span>
        </li>)}
      </ul>
    </div>}
    {report.Warnings.length > 0 && <ul className="flex flex-col gap-1.5">
      {report.Warnings.map((warning, index) => <li key={`${warning.Code}-${index}`} className="flex items-start gap-2 text-sm">
        <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ib-warn)]" /><span>{warningText(warning)}</span>
      </li>)}
    </ul>}
    {events.length > 0 && <div>
      <h4 className="mb-1 text-sm font-medium text-foreground">{t("ed.a.import.events")}</h4>
      <ul className="flex flex-col gap-2">
        {events.map((event) => <li key={event.EventID} data-usage-event className="rounded-md border border-border px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center gap-2"><strong className="font-medium">{event.Name}</strong>
            {event.Archived && <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{t("ed.a.import.eventArchived")}</span>}
            {event.RunningLabs > 0 && <span className="text-xs text-muted-foreground">{t(pluralKey("ed.a.import.warn.runningLabs", event.RunningLabs), { count: event.RunningLabs })}</span>}
            {event.Blocked && <span className="rounded bg-[var(--ib-warn-bg)] px-1.5 py-0.5 text-xs font-medium text-[var(--ib-warn)]">{t(event.VariantMissing ? "ed.a.import.blockedVariant" : "ed.a.import.blocked")}</span>}</div>
          {!event.VersionPublished && <p className="text-xs text-muted-foreground">{t("ed.a.import.eventOldVersion")}</p>}
          {event.Removed.length > 0 && <ul className="mt-1 flex flex-col gap-0.5">{event.Removed.map((task, index) => <li key={index} className="text-xs">
            <span className="text-[var(--ib-warn)]">{t("ed.a.import.removed")}</span> {task.Name}{task.Attempts > 0 && <span className="text-muted-foreground"> · {t("ed.a.import.attempts", { attempts: task.Attempts, solves: task.Solves })}</span>}</li>)}</ul>}
          {event.Added.length > 0 && <ul className="mt-1 flex flex-col gap-0.5">{event.Added.map((task, index) => <li key={index} className="text-xs"><span className="text-[var(--ib-ok)]">{t("ed.a.import.added")}</span> {task.Name}</li>)}</ul>}
        </li>)}
      </ul>
    </div>}
    <div className="flex flex-col gap-2"><h4 className="text-sm font-medium text-foreground">{t("ed.a.import.diff")}</h4>
      {report.Diff.Variants.map((variant, index) => <VariantDiff key={`${variant.Status}-${variant.Position}-${variant.StoredPosition}-${index}`} variant={variant} />)}
    </div>
  </div>
}
