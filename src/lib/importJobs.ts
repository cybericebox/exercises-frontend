/**
 * importJobs.ts — the background imports of this browser.
 *
 * A task archive that names image files is imported by a server job. The dialog only starts it (startImport) and
 * hands the job id here: this module polls the job on its own, so closing the dialog or leaving the page changes
 * nothing. The ids are kept in localStorage, so a reload resumes the polls.
 *
 * - the row of the catalog table (ImportRows) shows each followed import;
 * - done: a toast, the handlers of onImportsDone run (the catalog reloads), the id is forgotten at once;
 * - failed: a toast (when the failure was seen live) and the job stays until dismissImportJob, so the indicator can
 *   offer «Подробиці» and a reload still shows it.
 */
import { useEffect, useSyncExternalStore } from "react"
import { ApiError } from "@/api/client"
import { getImportJob, isPassing, listRunningImports, JOB_POLL_MS, type ImportJobStatus } from "@/api/exercises/archiveJobs"
import { toast } from "@/components/ui/toast"
import { t } from "@/i18n/t"
import type { Exercise } from "@/api/exercises/catalog"

export const IMPORT_JOBS_KEY = "exercises.importJobs"

export type TrackedImport = ImportJobStatus & { jobID: string }

const jobs = new Map<string, TrackedImport>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
// Jobs whose running state this tab has seen: only their end is announced with a failure toast.
const seenRunning = new Set<string>()
const listeners = new Set<() => void>()
// Jobs a dialog is showing: a done one stays until that dialog has read it, otherwise it goes at once.
const watched = new Map<string, number>()
const doneHandlers = new Set<(exercises: Exercise[]) => void>()
let snapshot: TrackedImport[] = []
let restored = false

const EMPTY: TrackedImport[] = []
const EMPTY_STATUS: ImportJobStatus = {
  state: "running", stage: "unpacking", imagesDone: 0, imagesTotal: 0, tasksDone: 0, tasksTotal: 0, bytesPushed: 0, bytesTotal: 0, exercises: [],
}

function emit() {
  snapshot = [...jobs.values()]
  listeners.forEach((listener) => listener())
}

function readStored(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(IMPORT_JOBS_KEY) ?? "[]")
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []
  } catch {
    return []
  }
}

// Running and failed jobs are kept; a finished one is not.
function persist() {
  try {
    const ids = [...jobs.values()].filter((job) => job.state !== "done").map((job) => job.jobID)
    if (ids.length > 0) localStorage.setItem(IMPORT_JOBS_KEY, JSON.stringify(ids))
    else localStorage.removeItem(IMPORT_JOBS_KEY)
  } catch { /* A browser without storage still follows the job; it just cannot resume after a reload. */ }
}

function schedule(jobID: string, delay: number) {
  clearTimeout(timers.get(jobID))
  timers.set(jobID, setTimeout(() => void poll(jobID), delay))
}

function forget(jobID: string) {
  clearTimeout(timers.get(jobID))
  timers.delete(jobID)
  seenRunning.delete(jobID)
  jobs.delete(jobID)
  persist()
  emit()
}

async function poll(jobID: string) {
  timers.delete(jobID)
  if (!jobs.has(jobID)) return
  let status: ImportJobStatus
  try {
    status = await getImportJob(jobID)
  } catch (error) {
    if (!jobs.has(jobID)) return
    if (isPassing(error)) return schedule(jobID, JOB_POLL_MS)
    // A job that is gone (another account's, or removed): nothing to follow.
    if (error instanceof ApiError && error.status === 404) return forget(jobID)
    status = { ...EMPTY_STATUS, state: "failed", stage: "failed", error: error instanceof ApiError ? error : new ApiError(500, null) }
  }
  if (!jobs.has(jobID)) return
  const live = seenRunning.has(jobID)
  jobs.set(jobID, { jobID, ...status })
  if (status.state === "running") {
    seenRunning.add(jobID)
    schedule(jobID, JOB_POLL_MS)
  } else {
    seenRunning.delete(jobID)
    persist()
    if (status.state === "done") {
      toast.success(t("admin.exImport.done", { count: status.exercises.length }))
      doneHandlers.forEach((handler) => handler(status.exercises))
      if (!watched.has(jobID)) return forget(jobID)
    } else if (live) {
      toast.error(t("admin.exImport.failed"))
    }
  }
  emit()
}

/** Follows a started import: polls it until it ends, whatever happens to the dialog. */
export function trackImportJob(jobID: string, firstPollIn = JOB_POLL_MS) {
  if (jobs.has(jobID)) return
  jobs.set(jobID, { jobID, ...EMPTY_STATUS })
  persist()
  emit()
  schedule(jobID, firstPollIn)
}

/**
 * Picks up the imports a reload interrupted; once per page load: the ids kept in localStorage, and the running
 * imports the server lists for the user (another device, cleared storage). A failed list is not an error here.
 */
export function restoreImportJobs() {
  if (restored) return
  restored = true
  for (const jobID of readStored()) trackImportJob(jobID, 0)
  listRunningImports().then((ids) => { for (const jobID of ids) trackImportJob(jobID, 0) }).catch(() => undefined)
}

/** Stops showing a finished or failed import. */
export function dismissImportJob(jobID: string) {
  const job = jobs.get(jobID)
  if (job && job.state === "running") return
  forget(jobID)
}

/** Runs when a background import is done; the handler gets the created tasks. */
export function onImportsDone(handler: (exercises: Exercise[]) => void): () => void {
  doneHandlers.add(handler)
  return () => { doneHandlers.delete(handler) }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** All imports this browser follows (running, and failed until dismissed; a done one only until it is read). */
export function useImportJobs(): TrackedImport[] {
  const all = useSyncExternalStore(subscribe, () => snapshot, () => EMPTY)
  useEffect(() => { restoreImportJobs() }, [])
  return all
}

/** One import a dialog is showing (it keeps a finished job until the dialog dismisses it), or undefined when it is not followed. */
export function useImportJob(jobID: string | null): TrackedImport | undefined {
  const all = useImportJobs()
  useEffect(() => {
    if (!jobID) return
    watched.set(jobID, (watched.get(jobID) ?? 0) + 1)
    return () => {
      const left = (watched.get(jobID) ?? 1) - 1
      if (left > 0) watched.set(jobID, left)
      else watched.delete(jobID)
      // The dialog went away with the job already over: nothing reads it any more.
      if (left === 0 && jobs.get(jobID)?.state === "done") forget(jobID)
    }
  }, [jobID])
  return jobID ? all.find((job) => job.jobID === jobID) : undefined
}

/** Test seam: forget everything, including the once-per-load restore. */
export function resetImportJobsForTests() {
  timers.forEach((timer) => clearTimeout(timer))
  timers.clear()
  jobs.clear()
  seenRunning.clear()
  watched.clear()
  doneHandlers.clear()
  restored = false
  snapshot = []
  emit()
}
