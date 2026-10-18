"use client"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { TABLE_CELL } from "@/components/ui/table"
import { t } from "@/i18n/t"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"
import { formatBytes } from "@/lib/formatBytes"
import { useImportJobs } from "@/lib/importJobs"
import { importStagePercent, importStageText } from "@/lib/importStage"

/**
 * The background imports as rows at the top of the catalog table, below the unsaved-draft row and whatever the
 * filters say: one row per import. A running one is neutral (the draft row is yellow): the crest loader, the stage with
 * its counts and a bar once the total is known. A failed one is red with the error and «Подробиці», which opens the
 * dialog on the error. Nothing here blocks the catalog.
 */
export function ImportRows({ columns, onDetails }: { columns: number; onDetails: (jobID: string) => void }) {
  const jobs = useImportJobs().filter((job) => job.state !== "done")
  if (jobs.length === 0) return null
  return <>
    {jobs.map((job) => {
      const failed = job.state === "failed"
      const cell = `${TABLE_CELL} ${failed ? "bg-[var(--ib-danger-bg)]" : "bg-secondary"}`
      const stage = importStageText(job)
      const percent = importStagePercent(job)
      return <tbody key={job.jobID} data-import-job={job.state} aria-live="polite">
        <tr className="h-10">
          <td colSpan={columns - 2} className={cell}>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {!failed && <Spinner size="sm" />}
              <span className="font-medium">{t("admin.exImport.rowTitle")}</span>
              {failed
                ? <span className="min-w-0 truncate text-[var(--ib-danger)]">{t("admin.exImport.failedWith", { message: exerciseErrorMessage(job.error) })}</span>
                : <>
                  <span className="min-w-0 truncate text-muted-foreground">{stage}</span>
                  {percent !== null && <span role="progressbar" aria-label={stage} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
                    className="h-1.5 w-40 overflow-hidden rounded-full bg-border"><span className="block h-full rounded-full bg-primary transition-[width] duration-150" style={{ width: `${percent}%` }} /></span>}
                </>}
            </span>
          </td>
          <td colSpan={2} className={cell}>
            <span className="flex justify-end gap-2 text-xs tabular-nums text-muted-foreground">
              {failed
                ? <Button type="button" size="sm" variant="outline" onClick={() => onDetails(job.jobID)}>{t("admin.exImport.details")}</Button>
                : job.stage === "images" && job.bytesTotal > 0
                  ? t("admin.exImport.bytes", { done: formatBytes(job.bytesPushed), total: formatBytes(job.bytesTotal) })
                  : percent !== null ? `${percent}%` : null}
            </span>
          </td>
        </tr>
      </tbody>
    })}
  </>
}
