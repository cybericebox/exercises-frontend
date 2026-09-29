"use client"

import { useEffect, useState } from "react"
import { listVersions, type VersionListItem } from "@/api/exercises/versions"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { LoadingArea } from "@/components/ui/spinner"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadError } from "@/components/ui/load-error"
import { t } from "@/i18n/t"
import { formatExerciseDateTime } from "@/lib/exerciseStatus"
import { useUserNames } from "@/lib/userNames"
import { cn } from "@/utils/cn"

const KIND_CLASS: Record<VersionListItem["Status"], string> = {
  draft: "bg-[var(--ib-warn-bg)] text-[var(--ib-warn)]",
  published: "bg-[var(--ib-ok-bg)] text-[var(--ib-ok)]",
  unpublished: "bg-muted text-muted-foreground",
  checkpoint: "bg-primary/10 text-primary",
}

function entryDate(version: VersionListItem): string {
  return version.Status === "published" || version.Status === "unpublished"
    ? version.PublishedAt ?? version.CreatedAt
    : version.CreatedAt
}

export function sortHistory(versions: VersionListItem[]): VersionListItem[] {
  return [...versions].sort((a, b) => {
    if (a.Status === "draft" && b.Status !== "draft") return -1
    if (b.Status === "draft" && a.Status !== "draft") return 1
    return Date.parse(entryDate(b)) - Date.parse(entryDate(a))
  })
}

export function HistoryDialog({ exerciseId, viewingVersionId, onClose, onView }: {
  exerciseId: string
  viewingVersionId: string | null
  onClose: () => void
  onView: (versionId: string | null) => void
}) {
  const [versions, setVersions] = useState<VersionListItem[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    listVersions(exerciseId)
      .then((items) => { if (!cancelled) setVersions(sortHistory(items)) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [exerciseId, attempt])

  const names = useUserNames((versions ?? []).map((version) => version.CreatedBy))
  const currentId = versions?.find((version) => version.Status === "draft")?.ID
    ?? versions?.find((version) => version.Status === "published")?.ID
    ?? null

  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl">
      <DialogHeader>
        <DialogTitle>{t("admin.exHistory.title")}</DialogTitle>
        <DialogDescription>{t("admin.exHistory.description")}</DialogDescription>
      </DialogHeader>
      <div className="max-h-[60vh] overflow-y-auto">
        {failed ? <LoadError compact message={t("admin.exHistory.loadError")} className="h-48" onRetry={() => { setFailed(false); setVersions(null); setAttempt((key) => key + 1) }} />
          : versions === null ? <LoadingArea compact className="h-48" label={t("admin.loading")} />
            : versions.length === 0 ? <EmptyState compact message={t("admin.exHistory.empty")} className="h-48" />
              : <ul>
                {versions.map((version) => {
                  const isCurrent = version.ID === currentId
                  const opened = viewingVersionId === null ? isCurrent : version.ID === viewingVersionId
                  const author = version.CreatedBy ? names[version.CreatedBy]?.name : undefined
                  const date = entryDate(version)
                  return <li key={version.ID}
                    className="grid gap-x-4 gap-y-1 border-b border-border px-2 py-2.5 last:border-b-0 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-center">
                    <span className={cn("w-fit rounded-full px-2 py-0.5 text-xs font-medium", KIND_CLASS[version.Status])}>
                      {t(`admin.exHistory.kind.${version.Status}`)}
                    </span>
                    <div className="min-w-0">
                      <time dateTime={date} className="text-sm tabular-nums text-foreground">{formatExerciseDateTime(date)}</time>
                      {version.Status === "checkpoint" && version.Label && <p className="truncate text-sm">«{version.Label}»</p>}
                      {author && <p className="text-xs text-muted-foreground">{author}</p>}
                    </div>
                    <Button type="button" size="sm" variant="outline" disabled={opened}
                      onClick={() => onView(isCurrent ? null : version.ID)}>
                      {t(opened ? "admin.exHistory.opened" : "admin.exHistory.view")}
                    </Button>
                  </li>
                })}
              </ul>}
      </div>
      <DialogFooter className="items-center gap-2 sm:justify-between">
        <p className="text-xs text-muted-foreground">{t("admin.exHistory.legend")}</p>
        <Button type="button" variant="outline" onClick={onClose}>{t("admin.exHistory.close")}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
