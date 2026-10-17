/**
 * archiveJobs.ts — waiting for the background jobs of archives with images.
 *
 *   GET /api/exercises/export/jobs/:id  → {State: running|done|failed, File?: {FileID, Name, …}, Error?}
 *   GET /api/exercises/import/jobs/:id  → {State: running|done|failed, Exercises?, Error?}
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
type ImportJob = JobState<{ Exercises?: RawExercise[] | null }>

/** The error a failed job stands for: 400 for the plain archive text (broken zip, wrong password), 409 otherwise. */
function jobError(error: JobError | undefined): ApiError {
  const code = error?.Code ?? 0
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

function isPassing(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 0 || error.status === 429 || error.status >= 500)
}

async function pollJob<T extends { State: string }>(path: string, signal?: AbortSignal): Promise<T & { State: "done" }> {
  const deadline = Date.now() + JOB_MAX_WAIT_MS
  for (;;) {
    await wait(JOB_POLL_MS, signal)
    let job: T & { Error?: JobError }
    try {
      job = await apiGet<T & { Error?: JobError }>(path, undefined, { silentOutage: true })
    } catch (error) {
      if (isPassing(error) && !signal?.aborted && Date.now() < deadline) continue
      throw error
    }
    if (job.State === "done") return job as T & { State: "done" }
    if (job.State === "failed") throw jobError(job.Error)
    if (Date.now() >= deadline) throw jobError({ Code: 70995 })
  }
}

/** Waits for a background export; resolves with the stored archive, ready for the chunked download. */
export async function waitForExportJob(jobID: string, signal?: AbortSignal): Promise<{ FileID: string; Name: string }> {
  const job = await pollJob<ExportJob>(`${BASE}/export/jobs/${encodeURIComponent(jobID)}`, signal)
  if (!job.File) throw jobError({ Code: 70998 })
  return { FileID: job.File.FileID, Name: job.File.Name }
}

/** Waits for a background import; resolves with the created tasks. */
export async function waitForImportJob(jobID: string, signal?: AbortSignal): Promise<Exercise[]> {
  const job = await pollJob<ImportJob>(`${BASE}/import/jobs/${encodeURIComponent(jobID)}`, signal)
  return (job.Exercises ?? []).map(normalizeExercise)
}
