"use client"

import { useEffect, useState } from "react"
import { getVariantStats, type VariantStats } from "@/api/exercises/stats"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadError } from "@/components/ui/load-error"
import { LoadingArea } from "@/components/ui/spinner"
import { Table, TABLE_CELL, TABLE_HEAD_CELL, TABLE_HEAD_ROW, TABLE_ROW } from "@/components/ui/table"
import { t } from "@/i18n/t"
import { formatExerciseDateTime } from "@/lib/exerciseStatus"

const BLOCK = "min-h-64"

/**
 * Subtasks are matched by position. Every variant of a published version has the same task ids in the same order,
 * so position maps correctly; it is also the only key for legacy snapshots with nil task ids.
 * A column is named by the first variant that has it.
 */
function subtaskColumns(version: VariantStats): string[] {
  const names: string[] = []
  for (const variant of version.Variants) {
    variant.Tasks.forEach((task, index) => { if (names[index] === undefined) names[index] = task.Name })
  }
  return names
}

function VersionTable({ version }: { version: VariantStats }) {
  const date = formatExerciseDateTime(version.PublishedAt ?? version.CreatedAt)
  const columns = subtaskColumns(version)
  const label = t("admin.exStats.version", { date })
  return <section className="mb-5 last:mb-0">
    <h3 className="mb-2 flex flex-wrap items-center gap-x-2 text-sm font-medium text-foreground">
      {label}
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{t(`admin.exHistory.kind.${version.Status}`)}</span>
    </h3>
    <Table label={label} regionClassName="max-w-full">
      <thead>
        <tr className={TABLE_HEAD_ROW}>
          <th scope="col" className={TABLE_HEAD_CELL}>{t("admin.exStats.variant")}</th>
          <th scope="col" className={`${TABLE_HEAD_CELL} text-right`}>{t("admin.exStats.issued")}</th>
          <th scope="col" className={`${TABLE_HEAD_CELL} text-right`}>{t("admin.exStats.solved")}</th>
          {columns.map((name, index) => <th key={index} scope="col" className={`${TABLE_HEAD_CELL} text-right`}>{name}</th>)}
        </tr>
      </thead>
      <tbody>
        {version.Variants.map((variant) => <tr key={variant.VariantID} className={TABLE_ROW}>
          <td className={`${TABLE_CELL} whitespace-nowrap`}>{t("admin.exDraft.variantN", { n: variant.Number })}</td>
          <td className={`${TABLE_CELL} text-right tabular-nums`}>{variant.Issued}</td>
          <td className={`${TABLE_CELL} text-right tabular-nums`}>{variant.Solved}</td>
          {columns.map((_, index) => <td key={index} className={`${TABLE_CELL} text-right tabular-nums`}>{variant.Tasks[index]?.Solved ?? ""}</td>)}
        </tr>)}
      </tbody>
    </Table>
  </section>
}

export function VariantStatsDialog({ exerciseId, onClose }: { exerciseId: string; onClose: () => void }) {
  const [stats, setStats] = useState<VariantStats[] | null>(null)
  const [failed, setFailed] = useState<{ cause: unknown } | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    getVariantStats(exerciseId)
      .then((items) => { if (!cancelled) setStats(items) })
      .catch((cause) => { if (!cancelled) setFailed({ cause }) })
    return () => { cancelled = true }
  }, [exerciseId, attempt])

  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl">
      <DialogHeader>
        <DialogTitle>{t("admin.exStats.title")}</DialogTitle>
        <DialogDescription>{t("admin.exStats.description")}</DialogDescription>
      </DialogHeader>
      <div data-testid="variant-stats-block" className={`${BLOCK} max-h-[60vh] overflow-y-auto`}>
        {failed ? <LoadError compact message={t("admin.exStats.loadError")} error={failed.cause} className={BLOCK}
          onRetry={() => { setFailed(null); setStats(null); setAttempt((key) => key + 1) }} />
          : stats === null ? <LoadingArea compact className={BLOCK} label={t("admin.loading")} />
            : stats.length === 0 ? <EmptyState compact message={t("admin.exStats.empty")} className={BLOCK} />
              : stats.map((version) => <VersionTable key={version.VersionID} version={version} />)}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>{t("admin.exHistory.close")}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
