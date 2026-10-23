"use client"

import { BookOpen, ChevronDown, Download, FileArchive, TriangleAlert, Upload, X } from "lucide-react"
import { useEffect, useRef, useState, type DragEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ApiError } from "@/api/client"
import { downloadImportExample, type ImportStart } from "@/api/exercises/archive"
import { commitArchiveImport, type ArchiveCommitInput, type ArchiveImportSummary } from "@/api/exercises/archiveImport"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { LoadError } from "@/components/ui/load-error"
import { EmptyState } from "@/components/ui/empty-state"
import { FileInput } from "@/components/ui/file-input"
import { Field } from "@/components/ui/form-field"
import { PasswordInput } from "@/components/ui/password-input"
import { SelectMenu } from "@/components/ui/select-menu"
import { LoadingArea } from "@/components/ui/spinner"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
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
  const uncertain = recovery?.state === "unknown" || Boolean(recovery && activeJob && !job)
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
    if (mounted.current) setResult(done)
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
  return <><Dialog open onOpenChange={open => { if (!open) close() }}>
    <DialogContent className={`exercise-import-dialog${compact ? " exercise-import-compact" : ""}`} {...dropProps} onEscapeKeyDown={event => { if (dragging) { event.preventDefault(); dragDepth.current = 0; setDragging(false) } }} onOpenAutoFocus={event => { event.preventDefault(); titleRef.current?.focus() }}>
      {dragging && dropActive && <div className="exercise-import-drop-overlay">{t("admin.exImport.dropHere")}</div>}
      <header className="exercise-import-head"><div><DialogTitle ref={titleRef} tabIndex={-1}>{t(fixedExercise ? "admin.exImport.update.title" : "admin.exImport.title")}</DialogTitle>
        <DialogDescription>{t(compact ? "admin.exImport.update.startIntro" : fixedExercise ? "admin.exImport.update.fixedIntro" : "admin.exImport.update.intro")}</DialogDescription></div>
        <div className="exercise-import-header-actions"><HoverTooltip text={t("admin.exImport.guideArchive")}><Link className="exercise-import-guide" href="/guide/arkhiv/" aria-label={t("admin.exImport.guideArchive")} aria-disabled={busy || undefined} onClick={event => { if (busy) event.preventDefault(); else { if (!dispatched.current) { flow.releaseEditors(); cancelReplacement?.() }; onClose() } }}><BookOpen aria-hidden="true" className="h-5 w-5" /></Link></HoverTooltip>
        <HoverTooltip text={t("admin.exImport.close")}><Button type="button" variant="ghost" size="icon" aria-label={t("admin.exImport.close")} onClick={close}><X aria-hidden="true" className="h-5 w-5" /></Button></HoverTooltip></div>
      </header>
      <div className="exercise-import-body">
        {compact && flow.busy ? <div className="exercise-import-compact-progress"><p><FileArchive aria-hidden="true" className="h-5 w-5 shrink-0" />{flow.file?.name}</p><div className="exercise-import-state"><LoadingArea message={busyLabel} />{progress !== null && <div className="exercise-import-progress" role="progressbar" aria-label={busyLabel} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>}</div></div>
        : <aside className="exercise-import-source"><h2>{t("admin.exImport.update.source")}</h2>
          <Field className={compact ? "exercise-import-initial-field" : undefined} label={t("admin.exImport.file")} required error={flow.fileError}>{control => <div className={compact ? "exercise-import-dropzone" : undefined}>
            {compact && <><Upload aria-hidden="true" className="h-6 w-6" /><p>{t("admin.exImport.dropHere")}</p></>}
            <FileInput {...control} accept=".zip,application/zip" file={flow.file} className={`exercise-import-file${compact && !flow.file ? " exercise-import-file-empty" : ""}`} disabled={busy || Boolean(activeJob) || uncertain} onFile={chooseArchive} />
            {compact && <p className="text-xs text-muted-foreground">{t("admin.exImport.update.zipHelp")}</p>}
          </div>}</Field>
          {flow.file && !compact && <p className="text-xs text-muted-foreground">{t("admin.exImport.update.fileMeta", { size: formatBytes(flow.file.size) })}</p>}
          {!compact && !activeJob && !result && <Field label={t("admin.exImport.password")} hint={t("admin.exImport.update.passwordHelp")}>{control => <PasswordInput {...control} autoComplete="off" value={flow.password} disabled={busy} onChange={event => flow.setPassword(event.target.value)} />}</Field>}
          {compact && !flow.file && <Button type="button" variant="outline" className="exercise-import-example" busy={exampleBusy} busyLabel={t("admin.exImport.update.exampleDownloading")} onClick={() => void downloadExample()}>{!exampleBusy && <Download aria-hidden="true" className="h-4 w-4" />}{t("admin.exImport.example")}</Button>}
          {compact && (exampleError || flow.error) && <p role="alert" className="text-sm text-destructive">{exampleError ?? flow.error}</p>}
        </aside>}

        {!compact && <section className="exercise-import-content" data-testid="import-content">
          <div className="exercise-import-options">

          {!fixedExercise && hasNew && !running && !activeJob && !result && !uncertain && <Field label={t("admin.exImport.update.destination")} error={ownerError} hint={t("admin.exImport.update.destinationHelp")}>{control => targets.length > 1
            ? <SelectMenu {...control} value={owner ?? ""} placeholder={t("admin.exImport.targetPick")} disabled={busy} options={targets.map(target => ({ value: target.value, label: target.label }))} onChange={value => { setOwner(value); setOwnerError(null); flow.ownerChanged() }} />
            : <span id={control.id} className="text-sm">{targets[0]?.label ?? t("admin.exImport.targetCatalog")}</span>}</Field>}
          {hasNew && !running && !result && !uncertain && <p className="exercise-import-footnote">{t("admin.exImport.update.atomic")}</p>}
          </div>
          {reconcileError ? <div className="exercise-import-state"><p role="alert">{reconcileError}</p><Button type="button" onClick={() => { setDispatching(true); void onReconcile?.().then(onClose).catch(() => setReconcileError(t("admin.exImport.update.reconcileError"))).finally(() => setDispatching(false)) }} busy={dispatching} busyLabel={t("admin.exImport.update.reconciling")}>{t("error.load.retry")}</Button></div>
          : result ? <><h2>{t("admin.exImport.resultTitle")}</h2><p className="text-sm text-muted-foreground">{result.created !== undefined && result.updated !== undefined ? t("admin.exImport.update.doneCounts", { created: result.created, updated: result.updated }) : t("admin.exImport.done", { count: result.exercises.length })}</p>
            {(result.results ?? result.exercises.map(exercise => ({ ItemKey: exercise.ID, ExerciseID: exercise.ID, Mode: "new" as const }))).map(destination => <div className="exercise-import-result" key={destination.ItemKey}><div><strong>{result.exercises.find(exercise => exercise.ID === destination.ExerciseID)?.Name ?? destination.ExerciseID}</strong><p>{t(destination.Mode === "update" ? "admin.exImport.update.updated" : "admin.exImport.update.created")}</p></div><Link href={exerciseHref(destination.ExerciseID)} onClick={onClose}>{t("admin.exImport.update.open")}</Link></div>)}</>
          : running || flow.busy ? <div className="exercise-import-state"><LoadingArea message={job ? importStageText(job) : busyLabel} />{progress !== null && <div className="exercise-import-progress" role="progressbar" aria-label={job ? importStageText(job) : busyLabel} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>}<p>{t(running ? "admin.exImport.update.runningHelp" : "admin.exImport.update.checkHelp")}</p></div>
          : uncertain ? <div className="exercise-import-state"><TriangleAlert aria-hidden="true" className="h-6 w-6" /><p role="alert">{flow.error ?? t("admin.exImport.update.unknown")}</p><Button type="button" onClick={() => void recover()}>{t("admin.exImport.update.recover")}</Button></div>
          : job?.state === "failed" ? <div className="exercise-import-state"><TriangleAlert aria-hidden="true" className="h-6 w-6" /><p role="alert">{exerciseErrorMessage(job.error)}</p><Button type="button" variant="outline" onClick={() => { dismissImportJob(job.jobID); setActiveJob(null); setRecovery(null); flow.invalidate(); dispatched.current = false; cancelReplacement?.() }}>{t("admin.exImport.update.chooseAgain")}</Button></div>
          : flow.error && !flow.items.length ? <LoadError className="exercise-import-empty" message={flow.error} onRetry={() => void flow.previewArchive()} />
          : <>
            {stale && <p className="exercise-import-notice" role="alert">{t("admin.exImport.update.stale")}</p>}
            {flow.error && <p className="exercise-import-notice text-destructive" role="alert">{flow.error}</p>}
            {!flow.items.length ? <EmptyState className="exercise-import-empty" message={t("admin.exImport.update.empty")} /> : <>
              <div className="exercise-import-content-title"><h2>{t("admin.exImport.update.review")}</h2><span>{t("admin.exImport.update.taskCount", { count: flow.items.length })}</span></div>
              {flow.items.map(item => <section className="exercise-import-item" key={item.ItemKey}>
                <h3>{item.Name}</h3>
                {fixedExercise ? <div className="exercise-import-fixed"><p>{t("admin.exImport.update.fixedTarget")}</p><strong>{fixedExercise.Name}</strong>{item.TargetExercise && <small>{importTargetContext(item.TargetExercise)}</small>}</div>
                : <Field label={t("admin.exImport.update.target")} error={flow.targetErrors[item.ItemKey]} hint={t(item.Target.Mode === "new" ? "admin.exImport.update.newNote" : item.SuggestedTarget.ExerciseID === item.Target.ExerciseID ? "admin.exImport.update.matched" : "admin.exImport.update.manual")}>
                  {control => <ImportTargetPicker {...control} itemKey={item.ItemKey} selected={item.TargetExercise} onChange={(target, exercise) => { setStale(false); void flow.chooseTarget(item.ItemKey, target, exercise) }} />}</Field>}
                {fixedExercise && flow.targetErrors[item.ItemKey] && <p role="alert" className="text-sm text-destructive">{flow.targetErrors[item.ItemKey]}</p>}
                {item.SourceIDMismatch && <p className="exercise-import-warning">{t("admin.exImport.update.mismatch")}</p>}
                {item.Target.Mode === "update" && <><ImportSummary summary={item.Summary} />{!item.ReplacesDraft && <p className="exercise-import-warning">{t("admin.exImport.update.unpublishedVersion")}</p>}</>}
              </section>)}
            </>}
          </>}
        </section>}
      </div>
      <footer className="exercise-import-footer">{!compact && <p>{t(uncertain ? "admin.exImport.update.unknownFoot" : running ? "admin.exImport.update.runningFoot" : flow.items.some(item => item.Target.Mode === "update") ? "admin.exImport.update.publishNote" : "admin.exImport.update.atomic")}</p>}<div>
        <Button type="button" variant="outline" onClick={close}>{t(running || uncertain ? "admin.exImport.update.minimize" : result ? "admin.exImport.close" : "admin.exPage.dialog.cancel")}</Button>
        {!compact && !activeJob && !result && !uncertain && <Button type="button" busy={busy} busyLabel={busyLabel} disabled={busy || !flow.file || Object.keys(flow.targetErrors).length > 0} onClick={() => { if (flow.preview) apply(); else void flow.previewArchive() }}>{t(flow.preview ? "admin.exImport.update.apply" : "admin.exImport.update.check")}</Button>}
      </div></footer>
    </DialogContent>
  </Dialog>
  <ConfirmDialog open={confirm} tone="danger" title={t("admin.exImport.update.replaceTitle")} description={t("admin.exImport.update.replaceBody")} confirmLabel={t("admin.exImport.update.replace")} busyLabel={t("admin.exImport.importing")} onCancel={() => setConfirm(false)} onConfirm={() => void dispatch(flow.commitInput(true), true)} />
  <ConfirmDialog open={stopAsk} tone="danger" title={t("admin.exImport.stopTitle")} description={t("admin.exImport.stopDescription")} confirmLabel={t("admin.exImport.stopConfirm")} cancelLabel={t("admin.exImport.stopKeep")} onCancel={() => setStopAsk(false)} onConfirm={() => { flow.invalidate(); flow.releaseEditors(); cancelReplacement?.(); onClose() }} />
  </>
}

function ImportSummary({ summary }: { summary: ArchiveImportSummary }) {
  return <dl className="exercise-import-summary">
    <dt>{t("admin.exImport.update.variants")}</dt><dd>{t("admin.exImport.update.variantCounts", { added: summary.Variants.Added, removed: summary.Variants.Removed, changed: summary.Variants.Changed })}</dd>
    <dt>{t("admin.exImport.update.subtasks")}</dt><dd>{t("admin.exImport.update.subtaskCounts", { before: summary.Subtasks.Before, after: summary.Subtasks.After })}</dd>
    <dt>{t("admin.exImport.update.flags")}</dt><dd>{t("admin.exImport.update.changed", { count: summary.FlagsChanged })}</dd>
    <dt>{t("admin.exImport.update.files")}</dt><dd>{t("admin.exImport.update.fileCounts", { added: summary.Files.Added, removed: summary.Files.Removed })}</dd>
    <dt>{t("admin.exImport.update.images")}</dt><dd>{t("admin.exImport.update.imageCounts", { new: summary.Images.New, reused: summary.Images.Reused })}</dd>
    <dt>{t("admin.exImport.update.metadata")}</dt><dd>{t(summary.MetadataChanged ? "admin.exImport.update.changedYes" : "admin.exImport.update.changedNo")}</dd>
    <details><summary><ChevronDown aria-hidden="true" className="h-4 w-4" />{t("admin.exImport.update.countHelp")}</summary><p>{t("admin.exImport.update.countExplanation")}</p></details>
  </dl>
}
