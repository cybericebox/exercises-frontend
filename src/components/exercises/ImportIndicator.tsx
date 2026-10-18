"use client"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { t } from "@/i18n/t"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"
import { useImportJobs } from "@/lib/importJobs"
import { importStageText } from "@/lib/importStage"

/**
 * The background imports next to the «Імпорт» button, one small chip per import (a single combined chip would need a
 * list of its own to open each one): a running one shows its stage and reopens the dialog with the live progress; a
 * failed one shows why and «Подробиці» opens the dialog on the error. Nothing here blocks the catalog.
 */
export function ImportIndicator({ onOpen }: { onOpen: (jobID: string) => void }) {
  const jobs = useImportJobs().filter((job) => job.state !== "done")
  if (jobs.length === 0) return null
  return <div className="flex min-w-0 flex-wrap items-center justify-end gap-2" aria-live="polite">
    {jobs.map((job) => job.state === "failed"
      ? <span key={job.jobID} className="inline-flex min-w-0 items-center gap-2 text-sm text-destructive">
        <span className="max-w-80 truncate">{t("admin.exImport.failedWith", { message: exerciseErrorMessage(job.error) })}</span>
        <Button type="button" size="sm" variant="outline" onClick={() => onOpen(job.jobID)}>{t("admin.exImport.details")}</Button>
      </span>
      : <Button key={job.jobID} type="button" size="sm" variant="outline" onClick={() => onOpen(job.jobID)}>
        <Spinner size="sm" className="mr-2" />{t("admin.exImport.indicator", { stage: importStageText(job) })}
      </Button>)}
  </div>
}
