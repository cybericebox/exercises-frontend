import type { ImportJobStatus } from "@/api/exercises/archiveJobs"
import { t } from "@/i18n/t"

type Progress = Pick<ImportJobStatus, "stage" | "imagesDone" | "imagesTotal" | "tasksDone" | "tasksTotal">

/** What a running import is doing: «Завантажуємо образи: 3 з 7». The counts appear once the stage knows its total. */
export function importStageText(job: Progress): string {
  if (job.stage === "images") {
    return job.imagesTotal > 0 ? t("admin.exImport.stage.imagesCount", { done: job.imagesDone, total: job.imagesTotal }) : t("admin.exImport.stage.images")
  }
  if (job.stage === "tasks") {
    return job.tasksTotal > 0 ? t("admin.exImport.stage.tasksCount", { done: job.tasksDone, total: job.tasksTotal }) : t("admin.exImport.stage.tasks")
  }
  return t("admin.exImport.stage.unpacking")
}

/** 0..100 of the current stage, or null while its total is not known (a bar would only guess). */
export function importStagePercent(job: Progress): number | null {
  const [done, total] = job.stage === "images" ? [job.imagesDone, job.imagesTotal] : job.stage === "tasks" ? [job.tasksDone, job.tasksTotal] : [0, 0]
  return total > 0 ? Math.min(100, Math.round(done / total * 100)) : null
}
