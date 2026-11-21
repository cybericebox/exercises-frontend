"use client"

import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import type { DraftConflict } from "@/lib/exerciseErrors"
import { formatExerciseDateTime } from "@/lib/exerciseStatus"

export function VersionBanner({ label, canRestore, busy, restoring = false, onBack, onRestore }: {
  label: string
  canRestore: boolean
  busy: boolean
  /** The restore itself runs: its button names it. */
  restoring?: boolean
  onBack: () => void
  onRestore: () => void
}) {
  return <div role="note" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg bg-primary/10 px-3.5 py-2.5 text-sm text-primary">
    <span>{label}</span>
    <span className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" onClick={onBack}>{t("admin.exPage.version.back")}</Button>
      {canRestore && <Button type="button" size="sm" busy={restoring} disabled={busy} onClick={onRestore}>{t(restoring ? "admin.exPage.version.restoring" : "admin.exPage.version.restore")}</Button>}
    </span>
  </div>
}

/** Someone else changed the working copy (409, 70922): who and when, and the way out — reload it. */
export function DraftConflictBanner({ conflict, onReload }: { conflict: DraftConflict; onReload: () => void }) {
  const date = conflict.savedAt ? formatExerciseDateTime(conflict.savedAt) : ""
  const what = conflict.savedBy && date ? t("admin.exPage.conflict.byAt", { name: conflict.savedBy, date })
    : conflict.savedBy ? t("admin.exPage.conflict.by", { name: conflict.savedBy })
      : date ? t("admin.exPage.conflict.at", { date }) : t("admin.exPage.conflict.unknown")
  return <div role="alert" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg bg-destructive/10 px-3.5 py-2.5 text-sm text-foreground">
    <span className="min-w-0"><span className="block font-medium">{what}</span><span className="block text-muted-foreground">{t("admin.exPage.conflict.hint")}</span></span>
    <Button type="button" size="sm" variant="outline" onClick={onReload}>{t("admin.exPage.conflict.reload")}</Button>
  </div>
}

export function ArchivedBanner({ canUnarchive, busy, unarchiving = false, onUnarchive }: { canUnarchive: boolean; busy: boolean; unarchiving?: boolean; onUnarchive: () => void }) {
  return <div role="note" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">
    <span>{t("admin.exPage.archived.banner")}</span>
    {canUnarchive && <Button type="button" size="sm" variant="outline" busy={unarchiving} disabled={busy} onClick={onUnarchive}>
      {t(unarchiving ? "admin.exPage.action.unarchiving" : "admin.exPage.action.unarchive")}
    </Button>}
  </div>
}
