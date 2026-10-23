"use client"

import { useState } from "react"
import { ApiError } from "@/api/client"
import { bulkArchive, bulkSetAccess, bulkUnarchive, runBulk, type BulkItem } from "@/api/exercises/bulk"
import type { AccessInput, Exercise, ExerciseListItem } from "@/api/exercises/catalog"
import { Download, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
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
const canManageAccess = (item: ExerciseListItem) => Boolean(item.Permissions?.CanManageAccess)

/**
 * The bar over the catalog table for the selected tasks: export, «Змінити доступ», «Архівувати», «Розархівувати».
 * An action shows only when the user may perform it for at least one selected task and runs on those tasks only (the
 * rest are reported as skipped); the server checks every task again by the single-task rule and skips the refused
 * ones, which the summary lists with the reasons.
 */
/** The selected tasks an action leaves out before any request, by reason: not in the needed state, or no right. */
export function localSkips(kind: Kind, selected: ExerciseListItem[]): { reason: string; count: number }[] {
  const count = (keep: (item: ExerciseListItem) => boolean) => selected.filter(keep).length
  const noRights = t("exercises.bulk.reason.noRights")
  if (kind === "access") return [{ reason: noRights, count: count((item) => !canManageAccess(item)) }]
  const archiving = kind === "archive"
  const inState = (item: ExerciseListItem) => Boolean(item.ArchivedAt) !== archiving
  return [
    { reason: t(archiving ? "exercises.bulk.reason.alreadyArchived" : "exercises.bulk.reason.notArchived"), count: count((item) => !inState(item)) },
    { reason: noRights, count: count((item) => inState(item) && !canEdit(item)) },
  ]
}

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
  const toArchive = selected.filter((item) => !item.ArchivedAt && canEdit(item))
  const toUnarchive = selected.filter((item) => item.ArchivedAt && canEdit(item))
  const toAccess = selected.filter(canManageAccess)
  const showExport = selected.every((item) => item.Permissions ? item.Permissions.CanExport : canExport)
  const label = t("admin.ex.selection.count", { count: selected.length })

  async function run(kind: Kind, input?: AccessInput) {
    if (progress) return
    const targets = kind === "archive" ? toArchive : kind === "unarchive" ? toUnarchive : toAccess
    const local = localSkips(kind, selected)
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
  const barButton = (kind: Kind) => <Button type="button" size="sm" variant="ghost" busy={progress?.kind === kind} disabled={progress !== null}
    onClick={() => setDialog(kind)}>{busyLabel(kind) ?? t(`exercises.bulk.${kind}.action`)}</Button>

  return <>
    {selected.length > 0 && (
      <div role="region" aria-label={label} className="catalog-bulkbar">
        <HoverTooltip text={t("admin.ex.selection.clear")}>
          <label className="catalog-check"><input type="checkbox" checked aria-label={t("admin.ex.selection.clear")} disabled={progress !== null} onChange={onClear} /></label>
        </HoverTooltip>
        <span className="font-semibold text-foreground">{label}</span>
        {showExport && <Button type="button" size="sm" variant="ghost" onClick={onExport}><Download aria-hidden="true" className="mr-1.5 h-4 w-4" />{t("admin.ex.selection.export")}</Button>}
        {toAccess.length > 0 && barButton("access")}
        {toArchive.length > 0 && barButton("archive")}
        {toUnarchive.length > 0 && barButton("unarchive")}
        {atLimit && <span className="text-xs text-muted-foreground">{t("admin.ex.selection.limit")}</span>}
        <span className="flex-1" />
        <HoverTooltip text={t("admin.ex.selection.clear")}>
          <Button type="button" size="icon" variant="ghost" aria-label={t("admin.ex.selection.clear")} disabled={progress !== null} onClick={onClear}><X aria-hidden="true" className="h-4 w-4" /></Button>
        </HoverTooltip>
      </div>
    )}
    {dialog === "access" && <BulkAccessDialog items={toAccess} progress={progress?.kind === "access" ? progress : null}
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
