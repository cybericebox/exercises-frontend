"use client"

import { useEffect, useState } from "react"
import { readImportReplacement, type ImportReplacementMarker } from "@/lib/importReplacement"
import { useRole } from "@/lib/useRole"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { t } from "@/i18n/t"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"
import { formatBytes } from "@/lib/formatBytes"
import { useImportJobs } from "@/lib/importJobs"
import { importStagePercent, importStageText } from "@/lib/importStage"

/**
 * The background imports as strips between the toolbar and the catalog table, below the unsaved-draft strip and
 * whatever the filters say: one strip per import. A running one is neutral (the draft row is yellow): the crest loader, the stage with
 * its counts and a bar once the total is known. A failed one is red with the error and «Подробиці», which opens the
 * dialog on the error. Nothing here blocks the catalog.
 */
export function ImportRows({ onDetails }: { onDetails: (jobID: string) => void }) {
  const jobs = useImportJobs().filter((job) => job.state !== "done" || Boolean(job.results?.length))
  const { me } = useRole()
  const [recovery, setRecovery] = useState<ImportReplacementMarker | null>(null)
  useEffect(() => {
    const update = () => setRecovery(me?.ID ? readImportReplacement(me.ID, "__catalog__") : null)
    update()
    window.addEventListener("exercises:import-replacement", update)
    window.addEventListener("storage", update)
    return () => { window.removeEventListener("exercises:import-replacement", update); window.removeEventListener("storage", update) }
  }, [me?.ID])
  if (jobs.length === 0 && !recovery) return null
  return <div className="catalog-strips">
    {recovery && !jobs.some(job => job.jobID === recovery.jobID) && <div className="catalog-strip" data-import-recovery>
      <span className="min-w-0 flex-1 truncate">{t(recovery.state === "unknown" ? "admin.exImport.update.unknown" : "admin.exImport.resultTitle")}</span>
      <Button type="button" size="sm" variant="outline" onClick={() => onDetails(recovery.jobID ?? "")}>{t("admin.exImport.details")}</Button>
    </div>}
    {jobs.map((job) => {
      const failed = job.state === "failed"
      const done = job.state === "done"
      const stage = done ? t("admin.exImport.update.doneCounts", { created: job.created ?? 0, updated: job.updated ?? 0 }) : importStageText(job)
      const percent = done ? null : importStagePercent(job)
      return <div key={job.jobID} data-import-job={job.state} aria-live="polite" className={failed ? "catalog-strip catalog-strip-danger" : "catalog-strip"}>
        {!failed && !done && <Spinner size="sm" />}
        <span className="shrink-0 font-medium">{t(done ? "admin.exImport.resultTitle" : "admin.exImport.rowTitle")}</span>
        {failed
          ? <span className="min-w-0 flex-1 truncate text-[var(--ib-danger)]">{t("admin.exImport.failedWith", { message: exerciseErrorMessage(job.error) })}</span>
          : <>
            <span className="min-w-0 truncate text-muted-foreground">{stage}</span>
            {percent !== null && <span role="progressbar" aria-label={stage} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
              className="h-1.5 w-40 shrink-0 overflow-hidden rounded-sm bg-border"><span className="block h-full bg-primary transition-[width] duration-150" style={{ width: `${percent}%` }} /></span>}
            <span className="flex-1" />
          </>}
        {!failed && job.stage === "images" && job.bytesTotal > 0
          ? <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{t("admin.exImport.bytes", { done: formatBytes(job.bytesPushed), total: formatBytes(job.bytesTotal) })}</span>
          : !failed && percent !== null ? <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{percent}%</span> : null}
        <Button type="button" size="sm" variant="outline" onClick={() => onDetails(job.jobID)}>{t("admin.exImport.details")}</Button>
      </div>
    })}
  </div>
}
