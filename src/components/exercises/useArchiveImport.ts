"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { ApiError } from "@/api/client"
import { commitArchiveImport, prepareArchiveImport, previewArchiveImport, type ArchiveCommitInput, type ArchiveImportPreview, type ArchiveImportSource, type ImportTarget, type ImportTargetExercise } from "@/api/exercises/archiveImport"
import { ARCHIVE_CONTENT_ERROR_CODES, archiveErrorMessage, errorContext, exerciseErrorCode, exerciseErrorMessage } from "@/lib/exerciseErrors"
import { hasImportEditors, prepareImportEditors, releaseImportEditors } from "@/lib/importReplacement"
import { importInitiationScope, isImportInitiationCurrent } from "@/lib/importJobs"
import { t } from "@/i18n/t"
import { ERR_REGISTRY_ACCESS_DENIED, registryErrorHelp } from "@/lib/imageErrors"

export const IMPORT_CONFIRMATION_STALE = 72906
/** The archive is protected and no password came / the password does not open it. */
export const ARCHIVE_PASSWORD_REQUIRED = 22909
export const ARCHIVE_PASSWORD_WRONG = 22910
export function importFieldFailure(cause: unknown): { file?: string; itemKey?: string; password?: string; message: string } {
  const code = exerciseErrorCode(cause)
  if (code === ARCHIVE_PASSWORD_REQUIRED || code === ARCHIVE_PASSWORD_WRONG) {
    const message = t(`admin.exImport.update.error.${code}`)
    return { password: message, message }
  }
  const context = errorContext(cause)
  const message = code && code >= 22901 && code <= 22908 || code === 72906 || code === 72907
    ? t(`admin.exImport.update.error.${code}`) : exerciseErrorMessage(cause)
  if (typeof context.itemKey === "string" && (context.field === "target" || context.field === "confirmation")) return { itemKey: context.itemKey, message }
  if (code === 22904 || code === 22903) return { file: message, message }
  if (code && [21002, 21008, 21010, 21011].includes(code)) return { file: message, message }
  if (code && ARCHIVE_CONTENT_ERROR_CODES.has(code) || typeof context.field === "string" && context.field !== "target" && context.field !== "confirmation") return { file: archiveErrorMessage(cause), message }
  return { message }
}
export function isUnknownImportOutcome(cause: unknown) {
  return !(cause instanceof ApiError) || cause.status === 0 || cause.status >= 500 || cause.status === 408
}

type Options = { actorID?: string | null; ownerEventID?: string | null; fixedExerciseID?: string; prepareReplacement?: () => Promise<boolean> }
export function useArchiveImport(options: Options = {}) {
  const [file, setFile] = useState<File | null>(null)
  const [password, passwordState] = useState("")
  const [preview, setPreview] = useState<ArchiveImportPreview | null>(null)
  const [items, setItems] = useState<ArchiveImportPreview["Items"]>([])
  const [busy, setBusy] = useState(false)
  const [sourceReady, setSourceReady] = useState(false)
  const [phase, setPhase] = useState<"saving" | "uploading" | "checking" | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** The help line under `error` when the general one does not fit (a registry an administrator must fix). */
  const [errorHelp, setErrorHelp] = useState<string | null>(null)
  const [targetErrors, setTargetErrors] = useState<Record<string, string>>({})
  const state = useRef({ file: null as File | null, password: "", source: null as ArchiveImportSource | null, choices: undefined as ImportTarget[] | undefined, preview: null as ArchiveImportPreview | null, revision: 0, prepared: [] as string[], dispatched: false })
  const optionsRef = useRef(options)
  useLayoutEffect(() => { optionsRef.current = options })
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  useEffect(() => { const current = state.current; mounted.current = true; return () => {
    mounted.current = false; controller.current?.abort(); current.revision += 1
    if (!current.dispatched && optionsRef.current.actorID) releaseImportEditors(optionsRef.current.actorID, current.prepared)
  } }, [])
  function invalidate() { state.current.revision += 1; state.current.preview = null; setPreview(null); setError(null); setErrorHelp(null); setTargetErrors({}); controller.current?.abort(); setBusy(false); setPhase(null) }
  function chooseFile(next: File | null) {
    invalidate(); setPasswordError(null); state.current.source = null; state.current.choices = undefined
    const valid = !next || next.name.toLowerCase().endsWith(".zip")
    state.current.file = valid ? next : null
    setSourceReady(false); setFile(state.current.file); setItems([]); setFileError(valid ? null : t("admin.exImport.notZip"))
  }
  function setPassword(next: string) { invalidate(); setPasswordError(null); state.current.password = next; passwordState(next) }
  function ownerChanged() { invalidate() }
  async function previewArchive(choices = state.current.choices) {
    const current = state.current
    if (!current.file) return
    invalidate()
    const revision = current.revision
    const scope = importInitiationScope()
    const active = () => mounted.current && revision === state.current.revision && isImportInitiationCurrent(scope)
    current.choices = choices
    const duplicates: Record<string, string> = {}
    const destinations = new Map<string, string>()
    for (const choice of choices ?? []) {
      if (choice.Mode !== "update" || !choice.ExerciseID) continue
      const previous = destinations.get(choice.ExerciseID)
      if (previous) { duplicates[previous] = t("admin.exImport.update.duplicate"); duplicates[choice.ItemKey] = t("admin.exImport.update.duplicate") }
      destinations.set(choice.ExerciseID, choice.ItemKey)
    }
    if (Object.keys(duplicates).length) { setTargetErrors(duplicates); return }
    setBusy(true); setFileError(null); setUploadProgress(null)
    const request = new AbortController(); controller.current = request
    try {
      if (optionsRef.current.prepareReplacement) {
        setPhase("saving")
        if (!await optionsRef.current.prepareReplacement()) {
          if (active()) { setError(t("admin.exImport.update.saveFirst")); setErrorHelp(null) }
          return
        }
      }
      if (!active()) return
      if (!current.source) {
        setPhase("uploading")
        const source = await prepareArchiveImport(current.file, p => { if (active()) setUploadProgress(p) }, request.signal)
        if (!active()) return
        current.source = source
        setSourceReady(true)
      }
      setPhase("checking")
      setUploadProgress(null)
      const input = { ...current.source, Password: current.password, OwnerEventID: optionsRef.current.ownerEventID ?? null,
        ...(optionsRef.current.fixedExerciseID ? { FixedExerciseID: optionsRef.current.fixedExerciseID } : {}), ...(choices ? { Targets: choices } : {}) }
      let answer = await previewArchiveImport(input, request.signal)
      if (!active()) return
      const actorID = optionsRef.current.actorID
      const destinations = answer.Items.filter(item => item.Target.Mode === "update").map(item => item.Target.ExerciseID).filter((id): id is string => Boolean(id))
      const unprepared = destinations.filter(id => !current.prepared.includes(id))
      if (actorID && unprepared.length && hasImportEditors(actorID, unprepared)) {
        setPhase("saving")
        if (!await prepareImportEditors(actorID, unprepared)) { if (active()) { setError(t("admin.exImport.update.saveFirst")); setErrorHelp(null) }; return }
        if (!active()) { releaseImportEditors(actorID, unprepared); return }
        current.prepared.push(...unprepared)
        setPhase("checking")
        // Any orphaned save has now settled; only this fresh server revision may be consented to.
        answer = await previewArchiveImport({ ...input, Targets: answer.Items.map(item => item.Target) }, request.signal)
        if (!active()) return
      }
      if (actorID) releaseImportEditors(actorID, current.prepared.filter(id => !destinations.includes(id)))
      current.prepared = current.prepared.filter(id => destinations.includes(id))
      current.preview = answer
      current.choices = answer.Items.map(item => item.Target)
      setPreview(answer); setItems(answer.Items)
    } catch (cause) {
      if (!active() || request.signal.aborted) return
      const failure = importFieldFailure(cause)
      if (failure.password) setPasswordError(failure.password)
      else if (failure.file) setFileError(failure.file)
      else if (failure.itemKey && current.choices?.some(choice => choice.ItemKey === failure.itemKey)) setTargetErrors({ [failure.itemKey]: failure.message })
      // A refused registry token: a short title; the help line under it says who fixes it and where.
      else { setError(exerciseErrorCode(cause) === ERR_REGISTRY_ACCESS_DENIED ? t("exercises.image.accessDeniedTitle") : failure.message); setErrorHelp(registryErrorHelp(cause)) }
    } finally { if (active()) { setBusy(false); setPhase(null) } }
  }
  async function chooseTarget(key: string, target: ImportTarget, targetExercise?: ImportTargetExercise) {
    setItems(previous => previous.map(item => item.ItemKey === key ? { ...item, Target: target, TargetExercise: targetExercise ?? null } : item))
    const choices = (state.current.choices ?? []).map(choice => choice.ItemKey === key ? target : choice)
    await previewArchive(choices)
  }
  function commitInput(confirmed: boolean): ArchiveCommitInput {
    const current = state.current
    if (!current.preview || !current.source || !current.choices?.length) throw new Error("Preview required")
    if (!confirmed && current.preview.Items.some(item => item.ReplacesDraft)) throw new Error("Confirmation required")
    return { ...current.source, Password: current.password, OwnerEventID: optionsRef.current.ownerEventID ?? null,
      ...(optionsRef.current.fixedExerciseID ? { FixedExerciseID: optionsRef.current.fixedExerciseID } : {}),
      Targets: current.choices, ConfirmedUpdates: current.preview.Items.filter(item => item.Target.Mode === "update").map(item => ({ ItemKey: item.ItemKey, Revision: item.ConfirmationRevision, ReplaceDraft: item.ReplacesDraft && confirmed })) }
  }
  function releaseEditors() {
    if (optionsRef.current.actorID) releaseImportEditors(optionsRef.current.actorID, state.current.prepared)
    state.current.prepared = []; state.current.dispatched = false
  }
  function retainEditors() { state.current.dispatched = true }
  async function commit(confirmed: boolean) { return commitArchiveImport(commitInput(confirmed)) }
  return { releaseEditors, retainEditors, file, password, passwordError, preview, items, busy, sourceReady, phase, uploadProgress, fileError, error, errorHelp, targetErrors, chooseFile, setPassword, ownerChanged, previewArchive, chooseTarget, commitInput, commit, setError, setFileError, setTargetErrors, invalidate }
}
