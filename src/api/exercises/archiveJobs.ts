/**
 * archiveJobs.ts — waiting for the background jobs of archives with images.
 *
 *   GET /api/exercises/export/jobs/:id  → {State: running|done|failed, File?: {FileID, Name, …}, Error?}
 *   GET /api/exercises/import/jobs/:id  → {State: running|done|failed, Stage, ImagesDone/Total, TasksDone/Total,
 *                                          BytesPushed/Total, Exercises?, Error?}
 *
 * An export is awaited here. An import is only read here (getImportJob): the poll of its progress lives in
 * lib/importJobs.ts, so the dialog can be closed while the job runs.
 *
 * The wait is a quiet poll: a failed poll (network, rate limit, server trouble) is asked again on the next round
 * and never reported as a platform outage. A failed job is thrown as an ApiError that looks like the answer the
 * synchronous route would have given (Status.Code / Message / Context), so the usual error texts apply.
 */
import { ApiError, apiGet } from "@/api/client"
import { normalizeExercise, type Exercise, type RawExercise } from "@/api/exercises/catalog"

const BASE = "/api/exercises"

/** How often a running job is asked about. */
export const JOB_POLL_MS = 2000
/** The longest wait for one job (the server stops a job after 6 h). */
export const JOB_MAX_WAIT_MS = 7 * 60 * 60 * 1000

type JobError = { Code: number; Message?: string; Context?: Record<string, unknown> }
type JobState<T> = { State: "running" | "done" | "failed"; Error?: JobError } & T
type ExportJob = JobState<{ File?: { FileID: string; Name: string } }>

/** Where a running import is; done and failed are the ends. */
export type ImportStage = "unpacking" | "images" | "tasks" | "done" | "failed"
type ImportJob = JobState<{
  Stage?: ImportStage
  ImagesDone?: number
  ImagesTotal?: number
  TasksDone?: number
  TasksTotal?: number
  BytesPushed?: number
  BytesTotal?: number
  Exercises?: RawExercise[] | null
}>

/** An import job as the UI reads it: the counts are 0 until the stage that learns them. */
export type ImportJobStatus = {
  state: "running" | "done" | "failed"
  stage: ImportStage
  imagesDone: number
  imagesTotal: number
  tasksDone: number
  tasksTotal: number
  bytesPushed: number
  bytesTotal: number
  exercises: Exercise[]
  error?: ApiError
}

/** The error a failed job stands for: 400 for the plain archive text (broken zip, wrong password), 409 otherwise, 500 for an internal failure. */
function jobError(error: JobError | undefined): ApiError {
  const code = error?.Code ?? 0
  // Code 0 is an internal failure: a server error with no backend text (the UI shows its own generic message).
  if (code === 0) return new ApiError(500, { Status: { Code: 0 } }, undefined, undefined, 0)
  const status = code === 20000 ? 400 : 409
  return new ApiError(status, { Status: { Code: code, Message: error?.Message, Context: error?.Context } }, error?.Message, undefined, code)
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

export function isPassing(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 0 || error.status === 429 || error.status >= 500)
}

async function pollJob<T extends { State: string }>(path: string, timeoutCode: number, signal?: AbortSignal): Promise<T & { State: "done" }> {
  const deadline = Date.now() + JOB_MAX_WAIT_MS
  for (;;) {
    await wait(JOB_POLL_MS, signal)
    let job: T & { Error?: JobError }
    try {
      job = await apiGet<T & { Error?: JobError }>(path, { signal }, { silentOutage: true })
    } catch (error) {
      if (isPassing(error) && !signal?.aborted && Date.now() < deadline) continue
      throw error
    }
    if (job.State === "done") return job as T & { State: "done" }
    if (job.State === "failed") throw jobError(job.Error)
    if (Date.now() >= deadline) throw jobError({ Code: timeoutCode })
  }
}

/** Waits for a background export; resolves with the stored archive, ready for the chunked download. */
export async function waitForExportJob(jobID: string, signal?: AbortSignal): Promise<{ FileID: string; Name: string }> {
  const job = await pollJob<ExportJob>(`${BASE}/export/jobs/${encodeURIComponent(jobID)}`, 70998, signal)
  if (!job.File) throw jobError({ Code: 70998 })
  return { FileID: job.File.FileID, Name: job.File.Name }
}

/** One read of a background import: its stage, counts and (at the end) the created tasks or the error. */
export async function getImportJob(jobID: string, signal?: AbortSignal): Promise<ImportJobStatus> {
  const job = await apiGet<ImportJob>(`${BASE}/import/jobs/${encodeURIComponent(jobID)}`, { signal }, { silentOutage: true })
  return {
    state: job.State,
    stage: job.Stage ?? (job.State === "running" ? "unpacking" : job.State),
    imagesDone: job.ImagesDone ?? 0,
    imagesTotal: job.ImagesTotal ?? 0,
    tasksDone: job.TasksDone ?? 0,
    tasksTotal: job.TasksTotal ?? 0,
    bytesPushed: job.BytesPushed ?? 0,
    bytesTotal: job.BytesTotal ?? 0,
    exercises: job.State === "done" ? (job.Exercises ?? []).map(normalizeExercise) : [],
    error: job.State === "failed" ? jobError(job.Error) : undefined,
  }
}
