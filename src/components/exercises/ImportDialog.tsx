"use client"

import { ChevronDown, Download, Upload } from "lucide-react"
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ApiError } from "@/api/client"
import { downloadImportExample, startImport, type ArchiveStage } from "@/api/exercises/archive"
import { SINGLE_REQUEST_MAX } from "@/api/exercises/files"
import type { Exercise } from "@/api/exercises/catalog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FileInput } from "@/components/ui/file-input"
import { Field } from "@/components/ui/form-field"
import { PasswordInput } from "@/components/ui/password-input"
import { toast } from "@/components/ui/toast"
import { t } from "@/i18n/t"
import { tRich } from "@/i18n/tRich"
import { downloadBlob } from "@/lib/downloadBlob"
import { formatBytes } from "@/lib/formatBytes"
import { dismissImportJob, trackImportJob, useImportJob, type TrackedImport } from "@/lib/importJobs"
import { importStagePercent, importStageText } from "@/lib/importStage"
import { ARCHIVE_CONTENT_ERROR_CODES, archiveErrorMessage, errorContext, exerciseErrorCode, exerciseErrorMessage } from "@/lib/exerciseErrors"
import { exerciseHref } from "@/lib/exerciseRoutes"
import "@/styles/import-howto.css"

// 400s of the upload itself (too large, wrong chunk size, damaged file, no name): not a missing password.
const UPLOAD_ERROR_CODES = new Set([21002, 21008, 21010, 21011])

// File names shown in the how-to steps (identifiers of the archive format, not translatable text).
const MANIFEST = "exercise.yaml"
const FILES_DIR = "files/"
const ZIP_EXT = ".zip"

/** What a failed import tells the user, and where: at the file picker, or globally with a password hint. */
function describeFailure(cause: unknown): { fileError: string | null; error: string | null; passwordNeeded: boolean } {
  // Upload and archive-content validation identify the archive. A generic 400 cannot distinguish a corrupt
  // archive from a missing/wrong password, so it must not mark the password invalid.
  const code = exerciseErrorCode(cause) ?? 0
  // A publish-gate refusal of a version imported as published names its archive path ("field") too.
  if (ARCHIVE_CONTENT_ERROR_CODES.has(code) || errorContext(cause).field) {
    return { fileError: archiveErrorMessage(cause), error: null, passwordNeeded: false }
  }
  if (UPLOAD_ERROR_CODES.has(code)) return { fileError: exerciseErrorMessage(cause), error: null, passwordNeeded: false }
  return { fileError: null, error: exerciseErrorMessage(cause), passwordNeeded: cause instanceof ApiError && cause.status === 400 }
}

/**
 * `jobId`: reopened from the catalog indicator on a background import (running: live progress; failed: the error).
 * Closing the dialog never cancels a job that is already queued; it goes on and the catalog shows its progress.
 */
export function ImportDialog({ onClose, onImported, jobId }: { onClose: () => void; onImported?: () => void; jobId?: string }) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [password, setPassword] = useState("")
  const [passwordNeeded, setPasswordNeeded] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [stage, setStage] = useState<ArchiveStage | null>(null)
  const [jobID, setJobID] = useState<string | null>(jobId ?? null)
  const job = useImportJob(jobID)
  // The ended job this dialog has read (it is dismissed from the catalog's indicator once read here).
  const [finished, setFinished] = useState<NonNullable<typeof job> | null>(null)
  if (job && job.state !== "running" && finished?.jobID !== job.jobID) setFinished(job)
  const tracking = job?.state === "running"
  const failure = finished?.state === "failed" && finished.error ? describeFailure(finished.error) : null
  const [exampleBusy, setExampleBusy] = useState(false)
  const [imported, setImported] = useState<Exercise[] | null>(null)

  // The sending of an archive stops when the dialog goes away; a queued job keeps running on the server and is
  // followed by lib/importJobs (importing the same archive again picks it up on the chunked paths only: the
  // multipart path stores a fresh file each time).
  const waiting = useRef<AbortController | null>(null)
  useEffect(() => () => waiting.current?.abort(), [])
  // Leaving is allowed while the server works on a queued job (not while the archive is going up).
  const canLeave = !busy
  function leave() {
    waiting.current?.abort()
    onClose()
  }

  // An import that ended while this dialog shows it: one task opens it, several are listed below (the toast and the
  // catalog reload are the store's). A failure is shown in the form; either way the job is read, so it is dismissed.
  const handled = useRef<string | null>(null)
  useEffect(() => {
    if (!finished || handled.current === finished.jobID) return
    handled.current = finished.jobID
    dismissImportJob(finished.jobID)
    if (finished.state === "done" && finished.exercises.length === 1) {
      onClose()
      router.push(exerciseHref(finished.exercises[0].ID))
    }
  }, [finished, onClose, router])
  const importedList = imported ?? (finished?.state === "done" && finished.exercises.length !== 1 ? finished.exercises : null)

  async function downloadExample() {
    setExampleBusy(true)
    setError(null)
    try {
      const { blob, filename } = await downloadImportExample()
      downloadBlob(blob, filename)
    } catch (cause) {
      // 401/403 and other coded errors speak for themselves; the generic text covers the rest.
      setError(exerciseErrorCode(cause) !== null ? exerciseErrorMessage(cause) : t("admin.exImport.exampleError"))
    } finally {
      setExampleBusy(false)
    }
  }

  // A dropped file skips the picker's accept filter, so the extension is checked here for both.
  function chooseFile(next: File | null) {
    setPasswordNeeded(false)
    if (next && !next.name.toLowerCase().endsWith(".zip")) {
      setFile(null)
      setFileError(t("admin.exImport.notZip"))
      return
    }
    setFile(next)
    setFileError(null)
  }

  // Whole-dialog drop target: the counter keeps child elements from flickering the overlay (every child fires its own enter/leave).
  const dragDepth = useRef(0)
  const [dragging, setDragging] = useState(false)
  const dropActive = !busy && !tracking && !importedList
  const showDrop = dragging && dropActive
  const carriesFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files")
  function endDrag() {
    dragDepth.current = 0
    setDragging(false)
  }
  useEffect(() => {
    if (!dragging) return
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") endDrag() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [dragging])
  const dropProps = {
    onDragEnter(event: DragEvent) {
      if (!dropActive || !carriesFiles(event)) return
      dragDepth.current += 1
      setDragging(true)
    },
    onDragOver(event: DragEvent) {
      if (carriesFiles(event)) event.preventDefault()
    },
    onDragLeave(event: DragEvent) {
      if (!carriesFiles(event) || dragDepth.current === 0) return
      dragDepth.current -= 1
      if (dragDepth.current === 0) setDragging(false)
    },
    onDrop(event: DragEvent) {
      endDrag()
      if (!carriesFiles(event)) return
      // The field handles (and marks) its own drops; anywhere else in the dialog takes the same path.
      const handledByField = event.defaultPrevented
      event.preventDefault()
      if (!handledByField && dropActive) chooseFile(event.dataTransfer.files?.[0] ?? null)
    },
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file) return
    setBusy(true)
    setProgress(null)
    setError(null)
    setFileError(null)
    setPasswordNeeded(false)
    setStage(null)
    setFinished(null)
    setJobID(null)
    const controller = new AbortController()
    waiting.current = controller
    try {
      // A big archive goes up in chunks (progress shown); a repeated submit resumes it.
      const started = await startImport(file, password, file.size > SINGLE_REQUEST_MAX ? setProgress : undefined, setStage, controller.signal)
      if (started.kind === "job") {
        // Queued: from here the job is followed by lib/importJobs, with or without this dialog.
        trackImportJob(started.jobID)
        setJobID(started.jobID)
        return
      }
      const result = started.exercises
      toast.success(t("admin.exImport.done", { count: result.length }))
      onImported?.()
      if (result.length === 1) {
        onClose()
        router.push(exerciseHref(result[0].ID))
        return
      }
      setImported(result)
    } catch (cause) {
      if (controller.signal.aborted) return
      const shown = describeFailure(cause)
      if (shown.fileError) setFileError(shown.fileError)
      if (shown.passwordNeeded) setPasswordNeeded(true)
      if (shown.error) setError(shown.error)
    } finally {
      setBusy(false)
      setProgress(null)
      setStage(null)
    }
  }

  // The busy button names the operation, with the percent while the archive goes up.
  const submitLabel = tracking && job ? importStageText(job)
    : busy ? (stage === "uploading" && progress !== null ? t("admin.exImport.uploadingPercent", { percent: progress }) : t("admin.exImport.importing"))
    : t("admin.exImport.submit")

  return <Dialog open onOpenChange={(open) => { if (!open && canLeave) leave() }}>
    <DialogContent {...dropProps}>
      {showDrop && <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-[inherit] border-2 border-dashed border-ring bg-popover text-sm font-medium text-foreground">
        <Upload aria-hidden="true" className="h-8 w-8" />
        {t("admin.exImport.dropHere")}
      </div>}
      <div data-testid="import-content" data-dimmed={showDrop || undefined} aria-hidden={showDrop || undefined} className={showDrop ? "contents invisible" : "contents"}>
      {importedList ? <>
        <DialogHeader>
          <DialogTitle>{t("admin.exImport.resultTitle")}</DialogTitle>
          <DialogDescription>{t("admin.exImport.done", { count: importedList.length })}</DialogDescription>
        </DialogHeader>
        <ul className="max-h-[50vh] space-y-1 overflow-y-auto text-sm">
          {importedList.map((exercise) => <li key={exercise.ID}>
            <Link href={exerciseHref(exercise.ID)} className="text-primary hover:underline" onClick={onClose}>{exercise.Name}</Link>
          </li>)}
        </ul>
        <DialogFooter><Button type="button" variant="outline" onClick={onClose}>{t("admin.exImport.close")}</Button></DialogFooter>
      </> : <form noValidate onSubmit={(event) => void submit(event)} className="space-y-4">
        <DialogHeader>
          <DialogTitle>{t("admin.exImport.title")}</DialogTitle>
          <DialogDescription>{t("admin.exImport.description")}</DialogDescription>
        </DialogHeader>
        <div className="relative space-y-4">
          <div className={tracking ? "hidden" : "space-y-4"}>
          <div className="import-howto">
            <details className="import-howto__details">
              <summary>{t("admin.exImport.howTo")}<ChevronDown aria-hidden="true" /></summary>
              <ol className="import-howto__steps">
                <li>{t("admin.exImport.step1")}</li>
                <li>{tRich("admin.exImport.step2", { file: <code>{MANIFEST}</code> })}</li>
                <li>{tRich("admin.exImport.step3", { dir: <code>{FILES_DIR}</code>, file: <code>{MANIFEST}</code> })}</li>
                <li>{tRich("admin.exImport.step4", { zip: <code>{ZIP_EXT}</code> })}</li>
              </ol>
            </details>
            <Button type="button" variant="ghost" size="sm" className="import-howto__example" busy={exampleBusy} onClick={() => void downloadExample()}>
              {!exampleBusy && <Download aria-hidden="true" className="mr-2 h-4 w-4" />}
              {t("admin.exImport.example")}
            </Button>
          </div>
          <Field label={t("admin.exImport.file")} required error={fileError ?? failure?.fileError}>
            {(control) => <FileInput {...control} accept=".zip,application/zip" file={file} onFile={chooseFile} />}
          </Field>
          <p className="-mt-2 text-xs text-muted-foreground">{t("admin.exImport.imagesHint")}</p>
          <Field label={t("admin.exImport.password")} hint={passwordNeeded || failure?.passwordNeeded ? t("admin.exImport.passwordNeeded") : undefined}>
            {(control) => <PasswordInput {...control} autoComplete="off" value={password} onChange={(event) => setPassword(event.target.value)} />}
          </Field>
          {busy && stage === "uploading" && progress !== null && (
            <div className="space-y-1.5" aria-live="polite">
              <div className="flex justify-between gap-2 text-xs text-muted-foreground"><span>{t("admin.exFiles.uploading")}</span><span>{progress}%</span></div>
              <div role="progressbar" aria-label={t("admin.exFiles.uploading")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-[width] duration-150" style={{ width: `${progress}%` }} /></div>
            </div>
          )}
          {(error ?? failure?.error) && <p role="alert" className="text-sm text-destructive">{error ?? failure?.error}</p>}
          </div>
          {job && tracking && <ImportStatus job={job} />}
        </div>
        <DialogFooter>
          {tracking
            ? <Button type="button" variant="outline" onClick={leave}>{t("admin.exImport.background")}</Button>
            : <Button type="button" variant="outline" disabled={!canLeave} onClick={leave}>{t("admin.exPage.dialog.cancel")}</Button>}
          <Button type="submit" className="min-w-56" busy={busy || tracking} disabled={busy || tracking || !file}>{submitLabel}</Button>
        </DialogFooter>
      </form>}
      </div>
    </DialogContent>
  </Dialog>
}

/** The live state of a queued import: the stage with its counts, a bar once the total is known, the image bytes sent. */
function ImportStatus({ job }: { job: TrackedImport }) {
  const text = importStageText(job)
  const percent = importStagePercent(job)
  return <div className="space-y-3 py-2" aria-live="polite">
    <p className="text-sm text-muted-foreground">{t("admin.exImport.backgroundHint")}</p>
    <div className="space-y-1.5">
      <div className="flex justify-between gap-2 text-sm"><span>{text}</span>{percent !== null && <span className="tabular-nums text-muted-foreground">{percent}%</span>}</div>
      <div role="progressbar" aria-label={text} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined} className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary transition-[width] duration-150" style={{ width: `${percent ?? 0}%` }} />
      </div>
      <p className="min-h-4 text-xs text-muted-foreground">{job.stage === "images" && job.bytesTotal > 0 ? t("admin.exImport.bytes", { done: formatBytes(job.bytesPushed), total: formatBytes(job.bytesTotal) }) : ""}</p>
    </div>
  </div>
}
