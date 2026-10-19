"use client"

import { useState } from "react"
import { ApiError } from "@/api/client"
import { bulkArchive, bulkSetAccess, bulkUnarchive, runBulk, type BulkItem } from "@/api/exercises/bulk"
import type { AccessInput, Exercise, ExerciseListItem } from "@/api/exercises/catalog"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "@/components/ui/toast"
import { t } from "@/i18n/t"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"
import { BulkAccessDialog } from "../AccessDialog"

type Kind = "access" | "archive" | "unarchive"
type Progress = { kind: Kind; done: number; total: number }
type Summary = { changed: number; skipped: number; reasons: { reason: string; count: number }[] }

/** Why the server skipped a task, in words (the error catalog by its code; -1: the request got no answer). */
function reasonOf(code: number): string {
  return exerciseErrorMessage(code > 0 ? new ApiError(0, { Status: { Code: code } }, undefined, undefined, code) : null)
}

/** The skipped tasks grouped by reason, the most frequent first. */
export function summarize(items: BulkItem[], local: { reason: string; count: number }[]): Summary {
  const counts = new Map<string, number>()
  for (const { reason, count } of local) if (count > 0) counts.set(reason, (counts.get(reason) ?? 0) + count)
  for (const item of items) {
    if (item.Exercise) continue
    const reason = reasonOf(item.Code)
    counts.set(reason, (counts.get(reason) ?? 0) + 1)
  }
  const reasons = [...counts].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count)
  return { changed: items.filter((item) => item.Exercise).length, skipped: reasons.reduce((sum, item) => sum + item.count, 0), reasons }
}

const canEdit = (item: ExerciseListItem) => Boolean(item.Permissions?.CanEdit)

/**
 * The bar over the catalog table for the selected tasks: export, «Змінити доступ», «Архівувати», «Розархівувати».
 * An action shows only when the user may perform it for at least one selected task; the server checks every task
 * by the single-task rule and skips the refused ones, which the summary lists with the reasons.
 */
export function BulkActions({ selected, canExport, atLimit, onExport, onClear, onChanged }: {
  selected: ExerciseListItem[]
  /** The export right of an older API without per-task Permissions; export shows when every selected task may be exported. */
  canExport: boolean
  atLimit: boolean
  onExport: () => void
  onClear: () => void
  /** The changed cards, to update their rows in place. */
  onChanged: (cards: Exercise[]) => void
}) {
  const [dialog, setDialog] = useState<Kind | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const toArchive = selected.filter((item) => !item.ArchivedAt)
  const toUnarchive = selected.filter((item) => item.ArchivedAt)
  const showExport = selected.every((item) => item.Permissions ? item.Permissions.CanExport : canExport)
  const showAccess = selected.some((item) => item.Permissions?.CanManageAccess)
  const showArchive = toArchive.some(canEdit)
  const showUnarchive = toUnarchive.some(canEdit)
  const label = t("admin.ex.selection.count", { count: selected.length })

  async function run(kind: Kind, input?: AccessInput) {
    if (progress) return
    const targets = kind === "archive" ? toArchive : kind === "unarchive" ? toUnarchive : selected
    const local = kind === "archive" ? [{ reason: t("exercises.bulk.reason.alreadyArchived"), count: selected.length - targets.length }]
      : kind === "unarchive" ? [{ reason: t("exercises.bulk.reason.notArchived"), count: selected.length - targets.length }] : []
    const call = kind === "archive" ? bulkArchive : kind === "unarchive" ? bulkUnarchive : (ids: string[]) => bulkSetAccess(ids, input as AccessInput)
    const items = await runBulk(targets.map((item) => item.ID), call, (done, total) => setProgress({ kind, done, total }))
    const cards = items.flatMap((item) => item.Exercise ? [item.Exercise] : [])
    if (cards.length > 0) onChanged(cards)
    setProgress(null)
    setDialog(null)
    onClear()
    const result = summarize(items, local)
    if (result.skipped === 0) toast.success(t("exercises.bulk.done", { count: result.changed }))
    else setSummary(result)
  }

  const busyLabel = (kind: Kind) => progress?.kind === kind ? t(`exercises.bulk.${kind}.busy`, { done: progress.done, total: progress.total }) : undefined
  const barButton = (kind: Kind) => <Button type="button" size="sm" variant="outline" busy={progress?.kind === kind} disabled={progress !== null}
    onClick={() => setDialog(kind)}>{busyLabel(kind) ?? t(`exercises.bulk.${kind}.action`)}</Button>

  return <>
    {selected.length > 0 && (
      <div role="region" aria-label={label} className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm">
        <span className="font-medium">{label}</span>
        {showExport && <Button type="button" size="sm" onClick={onExport}>{t("admin.ex.selection.export")}</Button>}
        {showAccess && barButton("access")}
        {showArchive && barButton("archive")}
        {showUnarchive && barButton("unarchive")}
        <Button type="button" size="sm" variant="ghost" disabled={progress !== null} onClick={onClear}>{t("admin.ex.selection.clear")}</Button>
        {atLimit && <span className="text-xs text-muted-foreground">{t("admin.ex.selection.limit")}</span>}
      </div>
    )}
    {dialog === "access" && <BulkAccessDialog items={selected} progress={progress?.kind === "access" ? progress : null}
      onApply={(input) => void run("access", input)} onClose={() => setDialog(null)} />}
    <ConfirmDialog open={dialog === "archive"} tone="danger" onCancel={() => setDialog(null)}
      title={t("exercises.bulk.archive.title", { count: toArchive.length })} description={t("exercises.bulk.archive.description")}
      confirmLabel={t("admin.exPage.archive.confirm")} busy={progress?.kind === "archive"} busyLabel={busyLabel("archive")}
      onConfirm={() => void run("archive")} />
    <ConfirmDialog open={dialog === "unarchive"} onCancel={() => setDialog(null)}
      title={t("exercises.bulk.unarchive.title", { count: toUnarchive.length })} description={t("exercises.bulk.unarchive.description")}
      confirmLabel={t("admin.exPage.action.unarchive")} busy={progress?.kind === "unarchive"} busyLabel={busyLabel("unarchive")}
      onConfirm={() => void run("unarchive")} />
    {summary && <Dialog open onOpenChange={(open) => { if (!open) setSummary(null) }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("exercises.bulk.summary.title")}</DialogTitle>
          <DialogDescription>{t("exercises.bulk.summary.counts", { changed: summary.changed, skipped: summary.skipped })}</DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {summary.reasons.map((item) => <li key={item.reason}>{t("exercises.bulk.summary.reason", { reason: item.reason, count: item.count })}</li>)}
        </ul>
        <DialogFooter>
          <Button type="button" onClick={() => setSummary(null)}>{t("exercises.bulk.summary.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>}
  </>
}
