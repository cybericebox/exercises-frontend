"use client"

import { BookOpen, Check, ChevronDown, Download, FileArchive, Lock, TriangleAlert, Upload, X } from "lucide-react"
import { useEffect, useRef, useState, type DragEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ApiError } from "@/api/client"
import { downloadImportExample, type ImportStart } from "@/api/exercises/archive"
import { commitArchiveImport, type ArchiveCommitInput, type ArchiveImportSummary, type ArchivePreviewItem, type ImportTarget, type ImportTargetExercise } from "@/api/exercises/archiveImport"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { LoadError } from "@/components/ui/load-error"
import { EmptyState } from "@/components/ui/empty-state"
import { FileInput } from "@/components/ui/file-input"
import { Field, type FieldControlProps } from "@/components/ui/form-field"
import { PasswordInput } from "@/components/ui/password-input"
import { SelectMenu } from "@/components/ui/select-menu"
import { LoadingArea, Spinner } from "@/components/ui/spinner"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { FieldHelp } from "@/components/ui/field-help"
import { t } from "@/i18n/t"
import { dismissImportJob, importInitiationScope, initiateImportJob, isImportInitiationCurrent, trackImportJob, useImportJob } from "@/lib/importJobs"
import { clearImportReplacement, readImportReplacement, recordImportPlan, settleImportPlan } from "@/lib/importReplacement"
import { exerciseErrorCode, exerciseErrorMessage } from "@/lib/exerciseErrors"
import { downloadBlob } from "@/lib/downloadBlob"
import { formatBytes } from "@/lib/formatBytes"
import { exerciseHref } from "@/lib/exerciseRoutes"
import { importStagePercent, importStageText } from "@/lib/importStage"
import type { OwnerOption } from "@/lib/exerciseRights"
import { useRole } from "@/lib/useRole"
import { ImportTargetPicker, importTargetContext } from "./ImportTargetPicker"
import { IMPORT_CONFIRMATION_STALE, importFieldFailure, isUnknownImportOutcome, useArchiveImport } from "./useArchiveImport"
import "@/styles/exercise-import.css"

export function defaultImportTarget(targets: OwnerOption[], requested: string | null): string | null {
  if (requested && targets.some(target => target.value === requested)) return requested
  if (targets.some(target => target.value === "")) return ""
  return targets.length === 1 ? targets[0].value : null
}
type Props = {
  onClose: () => void; isOriginActive?: () => boolean; onImported?: () => void; jobId?: string; targets?: OwnerOption[]; initialTarget?: string | null
  fixedExercise?: { ID: string; Name: string }; prepareReplacement?: () => Promise<boolean>; cancelReplacement?: () => void
  recordDispatch?: (input: ArchiveCommitInput, jobID?: string) => void; onReconcile?: () => Promise<void>
}
export function ImportDialog(props: Props) {
  const { me } = useRole()
  return <ArchiveImportDialog key={`${me?.ID ?? "anonymous"}:${props.fixedExercise?.ID ?? "catalog"}`} {...props} />
}

function ArchiveImportDialog({ onClose, isOriginActive, onImported, jobId, targets = [], initialTarget = null, fixedExercise, prepareReplacement, cancelReplacement, recordDispatch, onReconcile }: Props) {
  const router = useRouter()
  const { me } = useRole()
  const actorID = me?.ID ?? null
  const [owner, setOwner] = useState(() => defaultImportTarget(targets, initialTarget))
  const [exampleBusy, setExampleBusy] = useState(false)
  const [exampleError, setExampleError] = useState<string | null>(null)
  const [ownerError, setOwnerError] = useState<string | null>(null)
  const flow = useArchiveImport({ actorID, ownerEventID: owner || null, fixedExerciseID: fixedExercise?.ID, prepareReplacement })
  const [recovery, setRecovery] = useState(() => actorID ? readImportReplacement(actorID, fixedExercise?.ID ?? "__catalog__") : null)
  const [activeJob, setActiveJob] = useState<string | null>(jobId ?? recovery?.jobID ?? null)
  const job = useImportJob(activeJob)
  const [resultState, setResult] = useState<Extract<ImportStart, { kind: "done" }> | null>(null)
  const [dispatching, setDispatching] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [stopAsk, setStopAsk] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const [stale, setStale] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [reconcileError, setReconcileError] = useState<string | null>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const mounted = useRef(true)
  const inFlight = useRef(false)
  const dispatched = useRef(Boolean(recovery || jobId))
  const originPath = useRef(typeof window === "undefined" ? "" : window.location.pathname)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { if (activeJob) trackImportJob(activeJob, 0) }, [activeJob])
  // Restored jobs expose destinations without attaching navigation intent.
  const result = resultState ?? (job?.state === "done" ? { kind: "done" as const, exercises: job.exercises, results: job.results, created: job.created, updated: job.updated } : null)
  const busy = flow.busy || dispatching
  const running = job?.state === "running" || dispatching
  const uncertain = !resultState && (recovery?.state === "unknown" || Boolean(recovery && activeJob && !job))
  const compact = !flow.sourceReady && !activeJob && !recovery && !result
  const hasNew = flow.items.some(item => item.Target.Mode === "new")
  async function downloadExample() {
    setExampleBusy(true); setExampleError(null)
    try { const archive = await downloadImportExample(); if (mounted.current) downloadBlob(archive.blob, archive.filename) }
    catch (cause) { if (mounted.current) setExampleError(exerciseErrorCode(cause) !== null ? exerciseErrorMessage(cause) : t("admin.exImport.exampleError")) }
    finally { if (mounted.current) setExampleBusy(false) }
  }
  function close() {
    if (flow.busy) { setStopAsk(true); return }
    if (!dispatched.current) { flow.releaseEditors(); cancelReplacement?.() }
    if (result && actorID) { clearImportReplacement(actorID, "__catalog__"); if (activeJob) dismissImportJob(activeJob) }
    onClose()
  }
  function record(input: ArchiveCommitInput, jobID?: string) {
    const durable = actorID ? recordImportPlan(actorID, input, jobID) : false
    if (!durable && !jobID) return false
    recordDispatch?.(input, jobID)
    dispatched.current = true
    flow.retainEditors()
    if (actorID) setRecovery(readImportReplacement(actorID, fixedExercise?.ID ?? "__catalog__"))
    return true
  }
  async function complete(done: Extract<ImportStart, { kind: "done" }>, input: ArchiveCommitInput, autoNavigate: boolean) {
    if (actorID) settleImportPlan(actorID, input, true)
    if (window.location.pathname !== originPath.current || isOriginActive && !isOriginActive()) return
    if (mounted.current) onImported?.()
    if (fixedExercise) {
      if (!mounted.current) return
      try { await onReconcile?.(); if (mounted.current) onClose() }
      catch { if (mounted.current) { setReconcileError(t("admin.exImport.update.reconcileError")); setResult(done) } }
      return
    }
    const destinations = done.results?.map(item => item.ExerciseID) ?? done.exercises.map(item => item.ID)
    if (autoNavigate && destinations.length === 1) {
      if (actorID) clearImportReplacement(actorID, "__catalog__")
      onClose(); router.push(exerciseHref(destinations[0])); return
    }
    // The answer came: the outcome is known, so nothing is left to recover.
    if (mounted.current) { setRecovery(null); setResult(done) }
  }
  async function dispatch(input: ArchiveCommitInput, autoNavigate: boolean) {
    if (inFlight.current) return
    inFlight.current = true
    const scope = importInitiationScope()
    setDispatching(true); setConfirm(false); setReconcileError(null); flow.setError(null)
    try {
      if (!record(input)) {
        flow.invalidate(); flow.releaseEditors(); cancelReplacement?.()
        flow.setError(t("admin.exImport.update.storageError"))
        return
      }
      const answer = await commitArchiveImport(input)
      if (!isImportInitiationCurrent(scope)) return
      if (answer.kind === "job") {
        record(input, answer.jobID); setActiveJob(answer.jobID)
        initiateImportJob(answer.jobID, terminal => {
          if (actorID) settleImportPlan(actorID, input, terminal.state === "done")
          if (terminal.state === "done") void complete({ kind: "done", exercises: terminal.exercises, results: terminal.results, created: terminal.created, updated: terminal.updated }, input, autoNavigate)
          else if (mounted.current) { flow.releaseEditors(); cancelReplacement?.() }
        }, input.Targets.length > 1)
      } else await complete(answer, input, autoNavigate)
    } catch (cause) {
      if (!isImportInitiationCurrent(scope) || !mounted.current) return
      if (isUnknownImportOutcome(cause)) {
        flow.setError(t("admin.exImport.update.unknown"))
        return
      }
      // A replay after a lost synchronous response may find an already consumed/expired source.
      // It cannot prove success. Fixed context can still safely adopt the current authoritative snapshot.
      if (!autoNavigate && cause instanceof ApiError && exerciseErrorCode(cause) === 31006) {
        if (actorID) settleImportPlan(actorID, input, true)
        if (fixedExercise) {
          try { await onReconcile?.(); setRecovery(null); flow.setError(t("admin.exImport.update.unknownLoaded")) }
          catch { setReconcileError(t("admin.exImport.update.reconcileError")) }
        } else { flow.setError(t("admin.exImport.update.unknownUnavailable")); setRecovery(null); if (actorID) clearImportReplacement(actorID, "__catalog__") }
        return
      }
      if (actorID) settleImportPlan(actorID, input, false)
      dispatched.current = false; setRecovery(null)
      flow.releaseEditors(); cancelReplacement?.()
      if (exerciseErrorCode(cause) === IMPORT_CONFIRMATION_STALE) {
        setStale(true); await flow.previewArchive(); return
      }
      const failure = importFieldFailure(cause)
      if (failure.itemKey && flow.items.some(item => item.ItemKey === failure.itemKey)) flow.setTargetErrors({ [failure.itemKey]: failure.message })
      else if (failure.file) flow.setFileError(failure.file)
      else flow.setError(failure.message)
    } finally { inFlight.current = false; if (mounted.current && isImportInitiationCurrent(scope)) setDispatching(false) }
  }
  function apply() {
    if (hasNew && targets.length && owner === null) { setOwnerError(t("admin.exImport.targetRequired")); return }
    if (flow.preview?.Items.some(item => item.ReplacesDraft)) { setConfirm(true); return }
    void dispatch(flow.commitInput(false), true)
  }
  async function recover() {
    if (!recovery) return
    await dispatch({ ...recovery.plan, Password: flow.password } as ArchiveCommitInput, false)
  }
  const dropActive = !busy && !running && !recovery && !result
  function chooseArchive(file: File | null) {
    flow.chooseFile(file)
    if (file?.name.toLowerCase().endsWith(".zip")) void flow.previewArchive()
  }
  const carriesFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files")
  const dropProps = {
    onDragEnter(event: DragEvent) { if (dropActive && carriesFiles(event)) { dragDepth.current += 1; setDragging(true) } },
    onDragOver(event: DragEvent) { if (carriesFiles(event)) event.preventDefault() },
    onDragLeave(event: DragEvent) { if (carriesFiles(event) && dragDepth.current > 0) { dragDepth.current -= 1; if (dragDepth.current === 0) setDragging(false) } },
    onDrop(event: DragEvent) {
      dragDepth.current = 0; setDragging(false)
      if (!carriesFiles(event)) return
      const handled = event.defaultPrevented
      event.preventDefault()
      if (!handled && dropActive) chooseArchive(event.dataTransfer.files[0] ?? null)
    },
  }
  const progress = job ? importStagePercent(job) : flow.uploadProgress
  const busyLabel = flow.phase === "saving" ? t("admin.exImport.update.saving") : flow.uploadProgress !== null ? t("admin.exImport.uploadingPercent", { percent: flow.uploadProgress }) : dispatching ? t("admin.exImport.importing") : t("admin.exImport.update.checking")
  const errorCount = Object.keys(flow.targetErrors).length + (ownerError ? 1 : 0)
  // The tasks whose unpublished work an update replaces, named in the confirmation.
  const replacedNames = flow.items.filter(item => item.ReplacesDraft && item.Target.Mode === "update").map(item => item.TargetExercise?.Name ?? fixedExercise?.Name ?? item.Name)
  const updates = flow.items.filter(item => item.Target.Mode === "update").length
  const creates = flow.items.length - updates
  const applyLabel = updates && creates ? t("admin.exImport.update.applyBoth", { updates, created: creates })
    : updates ? t("admin.exImport.update.applyUpdates", { updates }) : creates ? t("admin.exImport.update.applyNew", { created: creates }) : t("admin.exImport.update.apply")
  const choosing = !busy && !activeJob && !recovery && !result && !uncertain
  const passwordShown = showPassword || Boolean(flow.password) || Boolean(flow.fileError) || Boolean(flow.passwordError)
  const fileInput = (control: Partial<FieldControlProps>, bare: boolean) => <FileInput {...control} accept=".zip,application/zip" file={flow.file}
    buttonOnly={bare} chooseLabel={bare ? t("admin.exImport.otherFile") : undefined}
    className={bare ? undefined : `exercise-import-file${!flow.file ? " exercise-import-file-empty" : ""}`} disabled={busy || Boolean(activeJob) || uncertain} onFile={chooseArchive} />
  const progressBar = (label: string) => progress !== null && <div className="exercise-import-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>
  return <><Dialog open onOpenChange={open => { if (!open) close() }}>
    <DialogContent className={`exercise-import-dialog${compact ? " exercise-import-compact" : ""}`} {...dropProps} onEscapeKeyDown={event => { if (dragging) { event.preventDefault(); dragDepth.current = 0; setDragging(false) } }} onOpenAutoFocus={event => { event.preventDefault(); titleRef.current?.focus() }}>
      {dragging && dropActive && <div className="exercise-import-drop-overlay">{t("admin.exImport.dropHere")}</div>}
      <header className="exercise-import-head"><DialogTitle ref={titleRef} tabIndex={-1}>{t(fixedExercise ? "admin.exImport.update.title" : "admin.exImport.title")}</DialogTitle>
        <DialogDescription className="sr-only">{t(compact ? "admin.exImport.update.startIntro" : fixedExercise ? "admin.exImport.update.fixedIntro" : "admin.exImport.update.intro")}</DialogDescription>
        <div className="exercise-import-header-actions"><HoverTooltip text={t("admin.exImport.guideArchive")}><Link className="exercise-import-guide" href="/guide/arkhiv/" aria-label={t("admin.exImport.guideArchive")} aria-disabled={busy || undefined} onClick={event => { if (busy) event.preventDefault(); else { if (!dispatched.current) { flow.releaseEditors(); cancelReplacement?.() }; onClose() } }}><BookOpen aria-hidden="true" className="h-4 w-4" /></Link></HoverTooltip>
        <HoverTooltip text={t("admin.exImport.close")}><Button type="button" variant="ghost" size="icon" aria-label={t("admin.exImport.close")} onClick={close}><X aria-hidden="true" className="h-4 w-4" /></Button></HoverTooltip></div>
      </header>
      <div className="exercise-import-body">
        {compact ? flow.busy
          ? <div className="exercise-import-filebar"><FileArchive aria-hidden="true" className="h-4 w-4 shrink-0" /><strong>{flow.file?.name}</strong><span className="flex-1" /><span className="exercise-import-busy"><Spinner size="sm" />{busyLabel}</span>{progressBar(busyLabel)}</div>
          : <>
            <Field className="exercise-import-initial-field" label={t("admin.exImport.file")} required error={flow.fileError}>{control => <div className="exercise-import-dropzone">
              <Upload aria-hidden="true" className="h-6 w-6" /><p>{t("admin.exImport.dropPrompt")}</p>
              {fileInput(control, false)}
              <p className="text-xs text-muted-foreground">{t("admin.exImport.update.zipHelp")}</p>
            </div>}</Field>
            {!flow.file && <p className="exercise-import-example-line">{t("admin.exImport.noArchive")}{" "}<Button type="button" variant="link" className="h-auto p-0 pointer-coarse:h-auto" busy={exampleBusy} busyLabel={t("admin.exImport.update.exampleDownloading")} onClick={() => void downloadExample()}>{!exampleBusy && <Download aria-hidden="true" className="mr-1 h-4 w-4" />}{t("admin.exImport.example")}</Button></p>}
            {(exampleError || flow.error) && <p role="alert" className="text-sm text-destructive">{exampleError ?? flow.error}</p>}
          </>
        : <>
          <Field className="exercise-import-file-field" label={t("admin.exImport.file")} error={flow.fileError}>{control => <div className="exercise-import-filebar">
            <FileArchive aria-hidden="true" className="h-4 w-4 shrink-0" /><strong>{flow.file?.name ?? t("admin.exImport.fileKept")}</strong>
            {flow.file && <span className="text-muted-foreground">{flow.items.length ? t("admin.exImport.update.fileMetaCount", { size: formatBytes(flow.file.size), count: flow.items.length }) : t("admin.exImport.update.fileMeta", { size: formatBytes(flow.file.size) })}</span>}
            <span className="flex-1" />
            {choosing && !passwordShown && <Button type="button" variant="link" className="h-auto p-0 text-xs pointer-coarse:h-auto" onClick={() => setShowPassword(true)}><Lock aria-hidden="true" className="mr-1 h-3.5 w-3.5" />{t("admin.exImport.hasPassword")}</Button>}
            {fileInput(control, true)}
          </div>}</Field>
          {passwordShown && !activeJob && !result && <div className="exercise-import-password">
            <Field label={t("admin.exImport.password")} hint={flow.passwordError ? undefined : t("admin.exImport.update.passwordHelp")} error={flow.passwordError}>{control => <PasswordInput {...control} autoComplete="off" autoFocus={Boolean(flow.passwordError)} value={flow.password} disabled={busy} onChange={event => flow.setPassword(event.target.value)} />}</Field>
            {!flow.preview && <Button type="button" variant="outline" busy={busy} busyLabel={busyLabel} disabled={busy || !flow.file} onClick={() => void flow.previewArchive()}>{t("admin.exImport.update.check")}</Button>}
          </div>}
          {!fixedExercise && hasNew && !running && !activeJob && !result && !uncertain && <div className="exercise-import-destination"><Field label={t("admin.exImport.update.destination")} error={ownerError}>{control => targets.length > 1
            ? <SelectMenu {...control} value={owner ?? ""} placeholder={t("admin.exImport.targetPick")} disabled={busy} options={targets.map(target => ({ value: target.value, label: target.label }))} onChange={value => { setOwner(value); setOwnerError(null); flow.ownerChanged() }} />
            : <span id={control.id} className="text-sm">{targets[0]?.label ?? t("admin.exImport.targetCatalog")}</span>}</Field><FieldHelp text={t("admin.exImport.update.destinationHelp")} /></div>}
          <section className="exercise-import-content" data-testid="import-content">
          {reconcileError ? <div className="exercise-import-state"><p role="alert">{reconcileError}</p><Button type="button" onClick={() => { setDispatching(true); void onReconcile?.().then(onClose).catch(() => setReconcileError(t("admin.exImport.update.reconcileError"))).finally(() => setDispatching(false)) }} busy={dispatching} busyLabel={t("admin.exImport.update.reconciling")}>{t("error.load.retry")}</Button></div>
          : result ? <div className="exercise-import-results"><h2>{t("admin.exImport.resultTitle")}</h2><p className="text-sm text-muted-foreground">{result.created !== undefined && result.updated !== undefined ? t("admin.exImport.update.doneCounts", { created: result.created, updated: result.updated }) : t("admin.exImport.done", { count: result.exercises.length })}</p>
            {(result.results ?? result.exercises.map(exercise => ({ ItemKey: exercise.ID, ExerciseID: exercise.ID, Mode: "new" as const }))).map(destination => <div className="exercise-import-result" key={destination.ItemKey}><strong>{result.exercises.find(exercise => exercise.ID === destination.ExerciseID)?.Name ?? destination.ExerciseID}</strong><span>{t(destination.Mode === "update" ? "admin.exImport.update.updated" : "admin.exImport.update.created")}</span><Link href={exerciseHref(destination.ExerciseID)} onClick={onClose}>{t("admin.exImport.update.open")}</Link></div>)}</div>
          : running || flow.busy ? <div className="exercise-import-state"><LoadingArea message={job ? importStageText(job) : busyLabel} />{progressBar(job ? importStageText(job) : busyLabel)}<p>{t(running ? "admin.exImport.update.runningHelp" : "admin.exImport.update.checkHelp")}</p></div>
          : uncertain ? <div className="exercise-import-state"><TriangleAlert aria-hidden="true" className="h-6 w-6" /><p role="alert">{flow.error ?? t("admin.exImport.update.unknown")}</p><Button type="button" onClick={() => void recover()}>{t("admin.exImport.update.recover")}</Button></div>
          : job?.state === "failed" ? <div className="exercise-import-state"><TriangleAlert aria-hidden="true" className="h-6 w-6" /><p role="alert">{exerciseErrorMessage(job.error)}</p><Button type="button" variant="outline" onClick={() => { dismissImportJob(job.jobID); setActiveJob(null); setRecovery(null); flow.invalidate(); dispatched.current = false; cancelReplacement?.() }}>{t("admin.exImport.update.chooseAgain")}</Button></div>
          : flow.error && !flow.items.length ? <LoadError className="exercise-import-empty" message={flow.error} onRetry={() => void flow.previewArchive()} />
          : <>
            {stale && <p className="exercise-import-notice" role="alert">{t("admin.exImport.update.stale")}</p>}
            {flow.error && <p className="exercise-import-notice text-destructive" role="alert">{flow.error}</p>}
            {!flow.items.length ? flow.fileError ? null : <EmptyState className="exercise-import-empty" message={t("admin.exImport.update.empty")} /> : <div className="exercise-import-table" role="table" aria-label={t("admin.exImport.update.review")}>
              <div className="exercise-import-row exercise-import-row-head" role="row"><span role="columnheader">{t("admin.exImport.col.source")}</span><span role="columnheader">{t("admin.exImport.col.target")}</span><span role="columnheader">{t("admin.exImport.col.changes")}</span><span role="columnheader"><span className="sr-only">{t("admin.exImport.col.details")}</span></span></div>
              {flow.items.map(item => <ImportRow key={item.ItemKey} item={item} fixedExercise={fixedExercise} error={flow.targetErrors[item.ItemKey]}
                onTarget={(target, exercise) => { setStale(false); void flow.chooseTarget(item.ItemKey, target, exercise) }} />)}
            </div>}
          </>}
          </section>
        </>}
      </div>
      {!(compact && !flow.busy) && <footer className="exercise-import-footer"><p>{!compact && !result && t(uncertain ? "admin.exImport.update.unknownFoot" : running ? "admin.exImport.update.runningFoot" : flow.items.some(item => item.Target.Mode === "update") ? "admin.exImport.update.publishNote" : "admin.exImport.update.atomic")}</p><div>
        {errorCount > 0 && choosing && <span className="exercise-import-error-count" role="status">{t("admin.exImport.update.fixErrors", { count: errorCount })}</span>}
        <Button type="button" variant="outline" onClick={close}>{t(running || uncertain ? "admin.exImport.update.minimize" : result || job?.state === "failed" ? "admin.exImport.close" : "admin.exPage.dialog.cancel")}</Button>
        {!compact && !activeJob && !result && !uncertain && flow.preview && <Button type="button" busy={busy} busyLabel={busyLabel} disabled={busy || !flow.file || errorCount > 0} onClick={apply}><span className="hidden sm:inline">{applyLabel}</span><span className="sm:hidden">{t("admin.exImport.update.apply")}</span></Button>}
        {!compact && !activeJob && !result && !uncertain && !flow.preview && !passwordShown && !(flow.error && !flow.items.length) && <Button type="button" busy={busy} busyLabel={busyLabel} disabled={busy || !flow.file} onClick={() => void flow.previewArchive()}>{t("admin.exImport.update.check")}</Button>}
      </div></footer>}
    </DialogContent>
  </Dialog>
  <ConfirmDialog open={confirm} tone="danger" title={t("admin.exImport.update.replaceTitle")} description={<>{t("admin.exImport.update.replaceBody")}{replacedNames.length > 0 && <span className="mt-2 block font-medium text-foreground">{replacedNames.length > 3
    ? t("admin.exImport.update.replaceTasksMore", { names: replacedNames.slice(0, 3).join(", "), count: replacedNames.length - 3 })
    : replacedNames.join(", ")}</span>}</>} confirmLabel={t("admin.exImport.update.replace")} busyLabel={t("admin.exImport.importing")} onCancel={() => setConfirm(false)} onConfirm={() => void dispatch(flow.commitInput(true), true)} />
  <ConfirmDialog open={stopAsk} tone="danger" title={t("admin.exImport.stopTitle")} description={t("admin.exImport.stopDescription")} confirmLabel={t("admin.exImport.stopConfirm")} cancelLabel={t("admin.exImport.stopKeep")} onCancel={() => setStopAsk(false)} onConfirm={() => { flow.invalidate(); flow.releaseEditors(); cancelReplacement?.(); onClose() }} />
  </>
}

/** Whether an update brings nothing new (every count zero, the general data unchanged). */
export function unchangedUpdate(item: ArchivePreviewItem): boolean {
  const s = item.Summary
  return item.Target.Mode === "update" && !s.MetadataChanged && s.FlagsChanged === 0 && s.Variants.Added + s.Variants.Removed + s.Variants.Changed === 0
    && s.Subtasks.Before === s.Subtasks.After && s.Files.Added + s.Files.Removed === 0 && s.Images.New === 0
}

/** The change chips of an update: «+added ~changed −removed» per part, the words in a tooltip. */
function changeChips(summary: ArchiveImportSummary): { key: string; text: string; tip: string }[] {
  const counts = (added: number, changed: number, removed: number) => [added && `+${added}`, changed && `~${changed}`, removed && `−${removed}`].filter(Boolean).join(" ")
  const chips: { key: string; text: string; tip: string }[] = []
  const variants = counts(summary.Variants.Added, summary.Variants.Changed, summary.Variants.Removed)
  if (variants) chips.push({ key: "variants", text: t("admin.exImport.chip.variants", { counts: variants }), tip: t("admin.exImport.update.variantCounts", { added: summary.Variants.Added, removed: summary.Variants.Removed, changed: summary.Variants.Changed }) })
  if (summary.Subtasks.Before !== summary.Subtasks.After) chips.push({ key: "subtasks", text: t("admin.exImport.chip.subtasks", { before: summary.Subtasks.Before, after: summary.Subtasks.After }), tip: t("admin.exImport.update.subtaskCounts", { before: summary.Subtasks.Before, after: summary.Subtasks.After }) })
  if (summary.FlagsChanged) chips.push({ key: "flags", text: t("admin.exImport.chip.flags", { counts: `~${summary.FlagsChanged}` }), tip: t("admin.exImport.update.changed", { count: summary.FlagsChanged }) })
  const files = counts(summary.Files.Added, 0, summary.Files.Removed)
  if (files) chips.push({ key: "files", text: t("admin.exImport.chip.files", { counts: files }), tip: t("admin.exImport.update.fileCounts", { added: summary.Files.Added, removed: summary.Files.Removed }) })
  if (summary.Images.New) chips.push({ key: "images", text: t("admin.exImport.chip.images", { counts: `+${summary.Images.New}` }), tip: t("admin.exImport.update.imageCounts", { new: summary.Images.New, reused: summary.Images.Reused }) })
  if (summary.MetadataChanged) chips.push({ key: "general", text: t("admin.exImport.chip.general"), tip: t("admin.exImport.update.changedYes") })
  return chips
}

/** One task of the archive: its name and how it was matched, where it goes, what will change, and the details. */
function ImportRow({ item, fixedExercise, error, onTarget }: { item: ArchivePreviewItem; fixedExercise?: { ID: string; Name: string }; error?: string; onTarget: (target: ImportTarget, exercise?: ImportTargetExercise) => void }) {
  const [open, setOpen] = useState(false)
  const update = item.Target.Mode === "update"
  const matched = update && item.SuggestedTarget.ExerciseID === item.Target.ExerciseID
  const how = !update ? t(item.SuggestedTarget.Mode === "new" ? "admin.exImport.row.notFound" : "admin.exImport.row.copy") : matched ? t("admin.exImport.row.matched") : t("admin.exImport.row.manual")
  const same = unchangedUpdate(item)
  const detailsLabel = t(open ? "admin.exImport.row.hideDetails" : "admin.exImport.row.showDetails", { name: item.Name })
  return <div className="exercise-import-row-group" role="rowgroup">
    <div className="exercise-import-row" role="row">
      <div role="cell" className="exercise-import-name"><strong>{item.Name}</strong><small>{how}</small></div>
      <div role="cell">{fixedExercise ? <div className="exercise-import-fixed"><span>{t("admin.exImport.update.fixedTarget")}</span><strong>{fixedExercise.Name}</strong>{item.TargetExercise && <small>{importTargetContext(item.TargetExercise)}</small>}</div>
        : <Field label={<span className="sr-only">{t("admin.exImport.update.target")}</span>} error={error}>{control => <ImportTargetPicker {...control} itemKey={item.ItemKey} selected={item.TargetExercise} onChange={onTarget} />}</Field>}
        {fixedExercise && error && <p role="alert" className="text-xs text-destructive">{error}</p>}</div>
      <div role="cell" className="exercise-import-chips">
        {!update ? <span className="exercise-import-chip exercise-import-chip-new">{t("admin.exImport.chip.new")}</span>
          : same ? <span className="exercise-import-chip exercise-import-chip-same"><Check aria-hidden="true" className="h-3.5 w-3.5" />{t("admin.exImport.chip.same")}</span>
          : changeChips(item.Summary).map(chip => <HoverTooltip key={chip.key} text={chip.tip}><span className="exercise-import-chip" tabIndex={0}>{chip.text}</span></HoverTooltip>)}
        {update && item.ReplacesDraft && <span className="exercise-import-chip exercise-import-chip-warn"><TriangleAlert aria-hidden="true" className="h-3.5 w-3.5" />{t("admin.exImport.chip.replacesDraft")}</span>}
        {update && !item.ReplacesDraft && !same && <span className="exercise-import-chip exercise-import-chip-quiet">{t("admin.exImport.chip.draft")}</span>}
        {item.SourceIDMismatch && <HoverTooltip text={t("admin.exImport.update.mismatch")} describe><span className="exercise-import-chip exercise-import-chip-warn" tabIndex={0}><TriangleAlert aria-hidden="true" className="h-3.5 w-3.5" />{t("admin.exImport.chip.otherId")}</span></HoverTooltip>}
      </div>
      <div role="cell">{update && !same && <HoverTooltip text={detailsLabel}><button type="button" className="exercise-import-toggle" aria-expanded={open} aria-label={detailsLabel} onClick={() => setOpen(value => !value)}><ChevronDown aria-hidden="true" className={open ? "h-4 w-4 rotate-180" : "h-4 w-4"} /></button></HoverTooltip>}</div>
    </div>
    {open && <div className="exercise-import-details" role="row"><div role="cell"><ImportSummary summary={item.Summary} /></div></div>}
  </div>
}

function ImportSummary({ summary }: { summary: ArchiveImportSummary }) {
  return <dl className="exercise-import-summary">
    <dt>{t("admin.exImport.update.variants")}</dt><dd>{t("admin.exImport.update.variantCounts", { added: summary.Variants.Added, removed: summary.Variants.Removed, changed: summary.Variants.Changed })}</dd>
    <dt>{t("admin.exImport.update.subtasks")}</dt><dd>{t("admin.exImport.update.subtaskCounts", { before: summary.Subtasks.Before, after: summary.Subtasks.After })}</dd>
    <dt>{t("admin.exImport.update.flags")}</dt><dd>{t("admin.exImport.update.changed", { count: summary.FlagsChanged })}</dd>
    <dt>{t("admin.exImport.update.files")}</dt><dd>{t("admin.exImport.update.fileCounts", { added: summary.Files.Added, removed: summary.Files.Removed })}</dd>
    <dt>{t("admin.exImport.update.images")}</dt><dd>{t("admin.exImport.update.imageCounts", { new: summary.Images.New, reused: summary.Images.Reused })}</dd>
    <dt>{t("admin.exImport.update.metadata")}</dt><dd>{t(summary.MetadataChanged ? "admin.exImport.update.changedYes" : "admin.exImport.update.changedNo")}</dd>
  </dl>
}
