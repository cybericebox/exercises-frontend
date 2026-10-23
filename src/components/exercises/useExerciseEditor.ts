"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useForm, type UseFormReturn } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ApiError } from "@/api/client"
import { createExercise, getExercise, updateExercise, updateExerciseKeepalive, type Exercise } from "@/api/exercises/catalog"
import { getDraft, getVersion, isStoredVersionId, saveDraft, saveDraftKeepalive, type Version } from "@/api/exercises/versions"
import { toast } from "@/components/ui/toast"
import { t } from "@/i18n/t"
import { exerciseErrorCode, exerciseErrorMessage } from "@/lib/exerciseErrors"
import {
  draftSchema, emptyDraft, identitySchema, toDraftFormValues, toSaveDraftInput,
  type DraftFormValues, type IdentityFormValues,
} from "@/lib/exerciseSchemas"
import {
  clearPendingChanges, hasDraftContent, mergePendingDraft, pendingBufferKey, readPendingChanges, writePendingChanges,
} from "@/lib/exercisePendingBuffer"
import { capturedDraftIds, savedSecretUpdates, serverIdUpdates } from "@/lib/serverIdUpdates"
import { withLinkedMirrorMuted } from "@/lib/linkedMirrorMute"
import type { ArchiveCommitInput } from "@/api/exercises/archiveImport"
import { clearImportReplacement, readImportReplacement, replacementMarker, registerImportEditor, sameImportPlan, writeImportReplacement, type ImportReplacementMarker } from "@/lib/importReplacement"
import { useExerciseAutosave, type ExerciseAutosave } from "./useExerciseAutosave"

export type ExerciseLoadState = "loading" | "ready" | "notFound" | "error"

// A server (5xx / timeout / rate limit) or network failure is a load error with retry; a 4xx
// answer (or "nothing published") means the exercise is not there for this user.
function isLoadFailure(error: unknown): boolean {
  if (error instanceof ApiError) return error.status >= 500 || error.status === 408 || error.status === 429
  return error instanceof TypeError
}

export type UseExerciseEditorOptions = {
  exerciseId: string | null
  versionId: string | null
  editable: boolean
  canWrite: boolean
  userId: string | null
  onCreated: (exercise: Exercise) => void
  onPendingRestored: () => void
  /** Owner event of a new exercise ("" or null = catalog). Read when the exercise is created. */
  ownerEventId?: string | null
  /**
   * Decides from the loaded card whether only the published version may be read
   * (non-admins on catalog exercises: no working copy). When set, the card is
   * fetched first and the draft or the published version is loaded after it.
   */
  publishedOnly?: (exercise: Exercise) => boolean
}

export type ExerciseEditor = {
  replacementActive: boolean
  replacementRecovery: ImportReplacementMarker | null
  prepareImportReplacement: () => Promise<boolean>
  cancelImportReplacement: () => void
  recordImportDispatch: (input: ArchiveCommitInput, jobID?: string) => void
  reconcileImportReplacement: () => Promise<void>
  loadState: ExerciseLoadState
  /** The failure behind loadState "error" (carries the code shown by LoadError). */
  loadError: unknown
  /** Loads again after loadState "error". */
  retryLoad: () => void
  exercise: Exercise | null
  setExercise: (exercise: Exercise) => void
  version: Version | null
  identityForm: UseFormReturn<IdentityFormValues>
  draftForm: UseFormReturn<DraftFormValues>
  autosave: ExerciseAutosave
  getDraftVersionId: () => string
  reloadWorkingCopy: () => Promise<void>
  /** Replaces the latest elevation request shown for the working copy (after a request is sent). */
  setElevation: (elevation: Version["Elevation"]) => void
  /** The published version is shown read-only (no working copy access). */
  readOnly: boolean
  /** A new task with content but no valid name yet: it lives only in this browser. */
  hasLocalDraft: () => boolean
}

function identityOf(exercise: Exercise, version?: Version): IdentityFormValues {
  return { Name: version?.Name ?? exercise.Name, Description: version?.Description ?? exercise.Description, Tags: version?.Tags ?? exercise.Tags }
}

// JSON object key order is not an edit (rich-text documents arrive as JSON); array order is.
function payloadSignature(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const object = item as Record<string, unknown>
      return Object.fromEntries(Object.keys(object).sort().map((key) => [key, object[key]]))
    }
    return item
  })
}

/**
 * Thrown by save() while an invalid identity edit was held back (changed draft values
 * are still persisted): the queue reports "error" (indicator, leave guard, buffer kept). No toast —
 * the field already shows the validation message.
 */
class IdentityRejectedError extends Error {
  constructor() { super("identity rejected") }
}

/** The empty working copy (Variants: []) opens like a new exercise: one empty variant. */
function workingCopyValues(version: Version): DraftFormValues {
  const values = toDraftFormValues(version)
  return values.Variants.length > 0 ? values : { ...emptyDraft(), AdminNote: values.AdminNote }
}

export function useExerciseEditor(options: UseExerciseEditorOptions): ExerciseEditor {
  const { exerciseId, versionId, editable, canWrite, userId } = options
  const optionsRef = useRef(options)
  optionsRef.current = options

  const [replacementActive, setReplacementActive] = useState(false)
  const [replacementRecovery, setReplacementRecovery] = useState<ImportReplacementMarker | null>(null)
  const replacementFence = useRef(false)
  useEffect(() => {
    const marker = userId && exerciseId ? readImportReplacement(userId, exerciseId) : null
    if (marker) { replacementFence.current = true; setReplacementActive(true); setReplacementRecovery(marker) }
  }, [userId, exerciseId])
  const [loadState, setLoadState] = useState<ExerciseLoadState>("loading")
  const [loadError, setLoadError] = useState<unknown>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [exercise, setExerciseState] = useState<Exercise | null>(null)
  const authorityRevisionRef = useRef(0)
  const setExercise = useCallback((value: Exercise) => {
    authorityRevisionRef.current += 1
    setExerciseState(value)
  }, [])
  const [version, setVersion] = useState<Version | null>(null)
  // Set once a buffer is restored; the effect below marks the change against the live
  // queue. Calling markChanged() inside the load effect itself would, under StrictMode,
  // mark the queue that the simulated unmount then orphans and flushes (a duplicate create).
  const [restored, setRestored] = useState(false)
  const [readOnly, setReadOnly] = useState(false)
  const exerciseIdRef = useRef<string | null>(exerciseId)
  const draftVersionIdRef = useRef("")
  const savedIdentityRef = useRef("")
  const savedDraftRef = useRef<string | null>(null)
  const suppressRef = useRef(false)
  const lastSignatureRef = useRef("")
  const lastSaveErrorRef = useRef<string | null>(null)
  const loadStartedRef = useRef(false)
  // Runs the change check a burst of edits is still waiting for (see the watch effect below).
  const checkPendingRef = useRef<() => void>(() => undefined)
  // Guards a create/save that keeps running after unmount (the autosave queue's
  // unmount-flush lets an in-flight save finish so nothing is lost) from firing
  // onCreated / setExercise for a hook instance nothing is listening to anymore —
  // onCreated typically drives a router.replace, which must not happen post-unmount.
  // Set (not just declared as) true in the effect itself, not only at useRef's initial
  // value: StrictMode's dev mount→cleanup→mount would otherwise leave this stuck at
  // `false` forever after the simulated cleanup, suppressing onCreated/setExercise for
  // the rest of the component's real lifetime.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const identityForm = useForm<IdentityFormValues>({
    resolver: zodResolver(identitySchema),
    defaultValues: { Name: "", Description: "", Tags: [] },
    mode: "onTouched",
  })
  const draftForm = useForm<DraftFormValues>({ resolver: zodResolver(draftSchema), defaultValues: emptyDraft(), mode: "onBlur" })

  const signature = useCallback(() => JSON.stringify([identityForm.getValues(), draftForm.getValues()]), [identityForm, draftForm])

  const rememberDraftVersion = useCallback((id: string) => { draftVersionIdRef.current = isStoredVersionId(id) ? id : "" }, [])

  const applyValues = useCallback((identity: IdentityFormValues, draft: DraftFormValues) => {
    suppressRef.current = true
    identityForm.reset(identity)
    draftForm.reset(draft)
    suppressRef.current = false
    lastSignatureRef.current = signature()
  }, [identityForm, draftForm, signature])

  const bufferKey = useCallback(() => userId ? pendingBufferKey(userId, exerciseIdRef.current) : null, [userId])

  const save = useCallback(async (): Promise<boolean> => {
    const identity = identityForm.getValues()
    const fullIdentity = identitySchema.safeParse(identity)
    let id = exerciseIdRef.current
    let identityRejected = false
    try {
      if (!id) {
        const name = identitySchema.shape.Name.safeParse(identity.Name)
        if (!name.success) return false
        const input = fullIdentity.success ? fullIdentity.data : { Name: name.data, Description: "", Tags: [] }
        const owner = optionsRef.current.ownerEventId
        const createdExercise = await createExercise(owner ? { ...input, OwnerEventID: owner } : input)
        id = createdExercise.ID
        exerciseIdRef.current = id
        savedIdentityRef.current = JSON.stringify(input)
        if (userId) {
          writePendingChanges(pendingBufferKey(userId, id), identity, draftForm.getValues())
          clearPendingChanges(pendingBufferKey(userId, null))
        }
        if (mountedRef.current) {
          setExercise(createdExercise)
          optionsRef.current.onCreated(createdExercise)
        }
      } else {
        // A valid edit compares in its parsed (trimmed) form, the one that is stored, so
        // surrounding spaces don't re-send it on every save. An invalid edit has no parsed
        // form; its raw values tell whether it differs from what is persisted.
        if (fullIdentity.success) {
          if (JSON.stringify(fullIdentity.data) !== savedIdentityRef.current) {
            const updated = await updateExercise(id, fullIdentity.data)
            savedIdentityRef.current = JSON.stringify(fullIdentity.data)
            rememberDraftVersion(updated.DraftVersionID ?? "")
            if (mountedRef.current) {
              setExercise(updated)
              setVersion((current) => current && { ...current, ID: updated.DraftVersionID ?? current.ID, ...fullIdentity.data })
            }
          }
        } else if (JSON.stringify(identity) !== savedIdentityRef.current) {
          // Invalid identity edit: never send it, but don't report the round as "saved"
          // either — changed draft values still go out so they aren't lost, then the round
          // fails with IdentityRejectedError so the indicator shows "not saved", the
          // leave guard stays armed and the buffer (holding the invalid identity) is kept.
          identityRejected = true
        }
      }
      const payload = draftForm.getValues()
      const input = toSaveDraftInput(payload)
      if (payloadSignature(input) !== savedDraftRef.current) {
        const sent = capturedDraftIds(payload)
        const saved = await saveDraft(id, input)
        // Only an acknowledged server snapshot advances the baseline, never live edits
        // made while this request was pending. Include assigned IDs for subsequent saves.
        savedDraftRef.current = payloadSignature(toSaveDraftInput(toDraftFormValues(saved)))
        rememberDraftVersion(saved.ID)
        authorityRevisionRef.current += 1
        if (mountedRef.current) setExerciseState((current) => current && { ...current, DraftVersionID: saved.ID, HasChanges: true })
        // The server recounts the resources and the elevation state on every save.
        if (mountedRef.current) setVersion((current) => current && { ...current, ID: saved.ID, Resources: saved.Resources, Elevation: saved.Elevation })
        // Computed before the ids are written: both guard on the variant ids that were sent.
        const secretUpdates = savedSecretUpdates(sent, saved, draftForm.getValues())
        const updates = serverIdUpdates(sent, saved, draftForm.getValues())
        if (updates.length > 0 || secretUpdates.length > 0) {
          // An edit still waiting for its check is marked first: the baseline reset below must not swallow it.
          checkPendingRef.current()
          suppressRef.current = true
          // Linked variants already hold the same ids (and secrets) as their base: no mirror pass while writing.
          withLinkedMirrorMuted(draftForm.control, () => {
            for (const update of updates) draftForm.setValue(update.path, update.value)
            for (const update of secretUpdates) draftForm.setValue(update.path, update.value)
          })
          suppressRef.current = false
          lastSignatureRef.current = signature()
        }
      }
      lastSaveErrorRef.current = null
      if (identityRejected) throw new IdentityRejectedError()
      return true
    } catch (error) {
      if (error instanceof IdentityRejectedError) throw error
      // One toast per distinct failure reason, not one per retry: the queue retries the
      // same save on every subsequent markChanged() until it succeeds, and would
      // otherwise spam identical "not saved" toasts for a single ongoing problem
      // (409 exists, archived, modified server-side, offline, ...).
      const message = exerciseErrorMessage(error)
      const identityFields: Record<number, keyof IdentityFormValues> = { 40903: "Name", 20908: "Name", 20909: "Description", 20910: "Tags" }
      const field = identityFields[exerciseErrorCode(error) ?? 0]
      if (field) {
        identityForm.setError(field, { type: "server", message })
        throw error
      }
      if (lastSaveErrorRef.current !== message) {
        toast.error(message)
        lastSaveErrorRef.current = message
      }
      throw error
    }
  }, [identityForm, draftForm, signature, userId, rememberDraftVersion, setExercise])

  const autosave = useExerciseAutosave({
    save,
    isReplacementFenced: () => replacementFence.current,
    onSaved: () => {
      const id = exerciseIdRef.current
      const revision = authorityRevisionRef.current
      if (id) void getExercise(id).then((refreshed) => {
        if (replacementFence.current || !mountedRef.current || revision !== authorityRevisionRef.current) return
        // A late card from an earlier snapshot must not undo acknowledged state.
        // A matching post-save card may still supply truthful HasChanges and ACL data.
        if ((refreshed.DraftVersionID ?? "") !== draftVersionIdRef.current) return
        setExerciseState(refreshed)
      }).catch(() => undefined)
    },
    writeBuffer: () => {
      const key = bufferKey()
      if (key) writePendingChanges(key, identityForm.getValues(), draftForm.getValues())
    },
    clearBuffer: () => {
      const key = bufferKey()
      if (key) clearPendingChanges(key)
    },
    sendKeepalive: () => {
      const id = exerciseIdRef.current
      if (!id) return
      const identity = identitySchema.safeParse(identityForm.getValues())
      if (identity.success && JSON.stringify(identity.data) !== savedIdentityRef.current) updateExerciseKeepalive(id, identity.data)
      const draft = toSaveDraftInput(draftForm.getValues())
      if (payloadSignature(draft) !== savedDraftRef.current) saveDraftKeepalive(id, draft)
    },
  })

  useEffect(() => {
    // userId can arrive asynchronously (e.g. from a session that resolves after mount).
    // Loading before it's known would restore/skip the pending buffer against the wrong
    // key; re-running once it arrives would re-fetch and reset whatever the user already
    // typed in the meantime. So: stay in "loading" until userId is known, then load
    // exactly once — loadStartedRef makes any later userId change a no-op here (a real
    // route change remounts this hook entirely via the page's key, which is the
    // supported way to point it at a different exercise/version).
    if (userId === null || loadStartedRef.current) return
    loadStartedRef.current = true
    // TS doesn't carry the narrowing above into the nested closure below; a fresh
    // const does (its type is fixed at this assignment, not re-derived from `userId`).
    const knownUserId = userId
    let cancelled = false
    let finished = false
    async function load() {
      try {
        if (!exerciseId) {
          const key = pendingBufferKey(knownUserId, null)
          const pending = readPendingChanges(key)
          if (pending && !canWrite) clearPendingChanges(key)
          if (pending && canWrite && !cancelled) {
            applyValues(pending.identity, pending.draft)
            toast.success(t("admin.ex.create.localOmitted"))
            optionsRef.current.onPendingRestored()
            setRestored(true)
          }
          if (!cancelled) setLoadState("ready")
          return
        }
        try {
          const publishedOnly = optionsRef.current.publishedOnly
          let loaded: Exercise
          let loadedVersion: Version
          let viewOnly = false
          if (publishedOnly) {
            loaded = await getExercise(exerciseId)
            viewOnly = publishedOnly(loaded)
            if (viewOnly && !versionId && !loaded.PublishedVersionID) throw new Error("nothing published")
            loadedVersion = versionId || viewOnly
              ? await getVersion(exerciseId, versionId ?? loaded.PublishedVersionID ?? "")
              : await getDraft(exerciseId)
          } else {
            [loaded, loadedVersion] = await Promise.all([
              getExercise(exerciseId),
              versionId ? getVersion(exerciseId, versionId) : getDraft(exerciseId),
            ])
          }
          if (cancelled) return
          if (viewOnly) {
            setReadOnly(true)
            setExercise(loaded)
            setVersion(loadedVersion)
            applyValues(identityOf(loaded, loadedVersion), workingCopyValues(loadedVersion))
            setLoadState("ready")
            return
          }
          const key = !versionId ? pendingBufferKey(knownUserId, exerciseId) : null
          const pending = key ? readPendingChanges(key) : null
          const recovering = readImportReplacement(knownUserId, exerciseId) !== null
          const apply = pending !== null && canWrite && !loaded.ArchivedAt && !recovering
          if (key && pending && !apply) clearPendingChanges(key)
          setExercise(loaded)
          setVersion(loadedVersion)
          if (!versionId) rememberDraftVersion(loadedVersion.ID)
          savedIdentityRef.current = JSON.stringify(identityOf(loaded, loadedVersion))
          const serverDraft = workingCopyValues(loadedVersion)
          savedDraftRef.current = isStoredVersionId(loadedVersion.ID) ? payloadSignature(toSaveDraftInput(toDraftFormValues(loadedVersion))) : null
          applyValues(apply ? pending.identity : identityOf(loaded, loadedVersion), apply ? mergePendingDraft(serverDraft, pending.draft) : serverDraft)
          setLoadState("ready")
          if (apply) {
            toast.success(t("admin.exPage.toast.pendingRestored"))
            optionsRef.current.onPendingRestored()
            setRestored(true)
          }
        } catch (error) {
          if (cancelled) return
          if (isLoadFailure(error)) { setLoadError(error); setLoadState("error") }
          else setLoadState("notFound")
        }
      } finally {
        finished = true
      }
    }
    void load()
    return () => {
      cancelled = true
      // StrictMode's dev mount→cleanup→mount cancels this run before it ever gets a
      // chance to settle (it's still awaiting the fetch, or — for a synchronous /new
      // pass — hasn't even reached this point yet, since `finished` is set by a
      // synchronous `finally` before any awaited call). Let the next invocation retry
      // from scratch instead of leaving loadStartedRef permanently set and the page
      // stuck on "loading". Once a run HAS settled, later cleanups (real unmount, or a
      // dependency changing again) must NOT re-arm it — only a genuine route change
      // (which remounts this hook via the page's key) should start a new load.
      if (!finished) loadStartedRef.current = false
    }
    // Load once per route (the detail page remounts on id/version change) — see
    // loadStartedRef above for why later userId changes don't re-trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseId, versionId, userId, loadAttempt])

  useEffect(() => {
    if (restored) autosave.markChanged()
    // Once per restore; autosave.markChanged is stable (see the watch effect below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored])

  useEffect(() => {
    if (!editable || loadState !== "ready") return
    lastSignatureRef.current = signature()
    // One check per burst of synchronous changes: a keystroke in a base variant is followed by
    // one mirror write per linked variant (useLinkedVariantSync); the whole-form signature is
    // computed once for all of them, after the burst.
    let scheduled = false
    let active = true
    const check = () => {
      scheduled = false
      if (!active || replacementFence.current) return
      const next = signature()
      if (next === lastSignatureRef.current) return
      lastSignatureRef.current = next
      autosave.markChanged()
    }
    const onChange = () => {
      if (suppressRef.current || scheduled) return
      scheduled = true
      queueMicrotask(check)
    }
    checkPendingRef.current = () => { if (scheduled) check() }
    // eslint-disable-next-line react-hooks/incompatible-library -- Imperative form subscription; React Compiler must not memoize this effect.
    const identityWatch = identityForm.watch(onChange)
    const draftWatch = draftForm.watch(onChange)
    return () => {
      // A change still waiting for its check is not dropped by a re-subscription.
      if (scheduled) check()
      active = false
      checkPendingRef.current = () => undefined
      identityWatch.unsubscribe()
      draftWatch.unsubscribe()
    }
    // autosave.markChanged is a useCallback with a fixed dependency chain (stable across
    // renders) even though the `autosave` object it hangs off is re-memoized on every
    // status change; depending on the whole object would resubscribe watch on every
    // "pending"/"saving"/"saved" transition for no behavioral benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, loadState, identityForm, draftForm, signature, autosave.markChanged])

  // On unmount, layout cleanups run before every passive one, so an edit still waiting for its
  // check is marked before the autosave hook's unmount flush looks for unsaved changes.
  useLayoutEffect(() => () => checkPendingRef.current(), [])

  const hasLocalDraft = useCallback(() => {
    checkPendingRef.current()
    if (exerciseIdRef.current) return false
    const identity = identityForm.getValues()
    return !identitySchema.shape.Name.safeParse(identity.Name).success && hasDraftContent(identity, draftForm.getValues())
  }, [identityForm, draftForm])

  const reloadWorkingCopy = useCallback(async () => {
    const id = exerciseIdRef.current
    if (!id) return
    const [loaded, draft] = await Promise.all([getExercise(id), getDraft(id)])
    setExercise(loaded)
    setVersion(draft)
    rememberDraftVersion(draft.ID)
    savedIdentityRef.current = JSON.stringify(identityOf(loaded, draft))
    savedDraftRef.current = isStoredVersionId(draft.ID) ? payloadSignature(toSaveDraftInput(toDraftFormValues(draft))) : null
    applyValues(identityOf(loaded, draft), workingCopyValues(draft))
  }, [applyValues, rememberDraftVersion, setExercise])

  const prepareImportReplacement = useCallback(async () => {
    checkPendingRef.current()
    replacementFence.current = true
    setReplacementActive(true)
    const ok = await autosave.prepareReplacement()
    if (!ok) { replacementFence.current = false; setReplacementActive(false) }
    return ok
  }, [autosave])
  const cancelImportReplacement = useCallback(() => {
    const id = exerciseIdRef.current
    if (userId && id) clearImportReplacement(userId, id)
    replacementFence.current = false
    autosave.resumeReplacement()
    setReplacementActive(false)
    setReplacementRecovery(null)
  }, [autosave, userId])
  const recordImportDispatch = useCallback((input: ArchiveCommitInput, jobID?: string) => {
    const id = exerciseIdRef.current
    if (!userId || !id) return
    const existing = readImportReplacement(userId, id)
    const marker = existing && sameImportPlan(existing, input) ? existing : replacementMarker(userId, id, input)
    const next: ImportReplacementMarker = { ...marker, ...(jobID ? { jobID, state: "running" as const } : {}) }
    writeImportReplacement(next)
    setReplacementRecovery(next)
  }, [userId])
  const reconcileImportReplacement = useCallback(async () => {
    replacementFence.current = true
    setReplacementActive(true)
    // An authoritative reload failure must leave the fence and exact old form values in place.
    const id = exerciseIdRef.current
    if (!id) return
    const [loaded, draft] = await Promise.all([getExercise(id), getDraft(id)])
    await autosave.discard()
    authorityRevisionRef.current += 1
    setExercise(loaded); setVersion(draft); rememberDraftVersion(draft.ID)
    savedIdentityRef.current = JSON.stringify(identityOf(loaded, draft))
    savedDraftRef.current = isStoredVersionId(draft.ID) ? payloadSignature(toSaveDraftInput(toDraftFormValues(draft))) : null
    applyValues(identityOf(loaded, draft), workingCopyValues(draft))
    if (userId) clearImportReplacement(userId, id)
    replacementFence.current = false
    autosave.resumeReplacement()
    setReplacementActive(false); setReplacementRecovery(null)
  }, [autosave, userId, setExercise, rememberDraftVersion, applyValues])

  const replacementMethods = useRef({ prepare: prepareImportReplacement, cancel: cancelImportReplacement })
  useLayoutEffect(() => { replacementMethods.current = { prepare: prepareImportReplacement, cancel: cancelImportReplacement } })
  useEffect(() => {
    if (!userId || !exerciseId) return
    const unregister = registerImportEditor(userId, exerciseId, { prepare: () => replacementMethods.current.prepare(), cancel: () => replacementMethods.current.cancel() })
    return () => {
      // Retain an orphan only while its old PATCH/PUT drain is unresolved. A later catalog
      // import awaits it before obtaining the target's final revision preview.
      if (autosave.hasUnsaved()) void autosave.prepareReplacement?.().finally(unregister)
      else unregister()
    }
    // Queue methods are stable; the ref supplies current editor callbacks without re-registering on save status.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, exerciseId, autosave.hasUnsaved, autosave.prepareReplacement])

  useEffect(() => {
    if (!userId || !exerciseId) return
    const update = () => {
      const marker = readImportReplacement(userId, exerciseId)
      if (!marker) return
      replacementFence.current = true
      setReplacementActive(true)
      setReplacementRecovery(marker)
    }
    window.addEventListener("exercises:import-replacement", update)
    window.addEventListener("storage", update)
    return () => { window.removeEventListener("exercises:import-replacement", update); window.removeEventListener("storage", update) }
  }, [userId, exerciseId])

  const retryLoad = useCallback(() => {
    loadStartedRef.current = false
    setLoadError(null)
    setLoadState("loading")
    setLoadAttempt((attempt) => attempt + 1)
  }, [])

  const setElevation = useCallback((elevation: Version["Elevation"]) => setVersion((current) => current && { ...current, Elevation: elevation }), [])

  const getDraftVersionId = useCallback(() => draftVersionIdRef.current, [])

  // An edit made in the same tick as a flush (or an unsaved check) is counted before it.
  const editorAutosave = useMemo<ExerciseAutosave>(() => ({
    ...autosave,
    flush: () => { checkPendingRef.current(); return autosave.flush() },
    hasUnsaved: () => { checkPendingRef.current(); return autosave.hasUnsaved() },
  }), [autosave])

  return {
    replacementActive, replacementRecovery, prepareImportReplacement, cancelImportReplacement, recordImportDispatch, reconcileImportReplacement,
    loadState, loadError, retryLoad, exercise, setExercise, version, identityForm, draftForm, autosave: editorAutosave, getDraftVersionId, reloadWorkingCopy, readOnly, setElevation, hasLocalDraft,
  }
}
