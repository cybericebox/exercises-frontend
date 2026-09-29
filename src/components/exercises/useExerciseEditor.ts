"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useForm, type UseFormReturn } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { createExercise, getExercise, updateExercise, updateExerciseKeepalive, type Exercise } from "@/api/exercises/catalog"
import { getDraft, getVersion, isStoredVersionId, saveDraft, saveDraftKeepalive, type Version } from "@/api/exercises/versions"
import { toast } from "@/components/ui/toast"
import { t } from "@/i18n/t"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"
import {
  draftSchema, emptyDraft, identitySchema, toDraftFormValues, toSaveDraftInput,
  type DraftFormValues, type IdentityFormValues,
} from "@/lib/exerciseSchemas"
import {
  clearPendingChanges, mergePendingDraft, pendingBufferKey, readPendingChanges, writePendingChanges,
} from "@/lib/exercisePendingBuffer"
import { capturedDraftIds, serverIdUpdates } from "@/lib/serverIdUpdates"
import { useExerciseAutosave, type ExerciseAutosave } from "./useExerciseAutosave"

export type ExerciseLoadState = "loading" | "ready" | "notFound"

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
  loadState: ExerciseLoadState
  exercise: Exercise | null
  setExercise: (exercise: Exercise) => void
  version: Version | null
  identityForm: UseFormReturn<IdentityFormValues>
  draftForm: UseFormReturn<DraftFormValues>
  autosave: ExerciseAutosave
  getDraftVersionId: () => string
  reloadWorkingCopy: () => Promise<void>
  /** The published version is shown read-only (no working copy access). */
  readOnly: boolean
}

function identityOf(exercise: Exercise): IdentityFormValues {
  return { Name: exercise.Name, Description: exercise.Description, Tags: exercise.Tags }
}

/**
 * Thrown by save() after the draft went out while an invalid identity edit was held
 * back: the queue reports "error" (indicator, leave guard, buffer kept). No toast —
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

  const [loadState, setLoadState] = useState<ExerciseLoadState>("loading")
  const [exercise, setExercise] = useState<Exercise | null>(null)
  const [version, setVersion] = useState<Version | null>(null)
  // Set once a buffer is restored; the effect below marks the change against the live
  // queue. Calling markChanged() inside the load effect itself would, under StrictMode,
  // mark the queue that the simulated unmount then orphans and flushes (a duplicate create).
  const [restored, setRestored] = useState(false)
  const [readOnly, setReadOnly] = useState(false)
  const exerciseIdRef = useRef<string | null>(exerciseId)
  const draftVersionIdRef = useRef("")
  const savedIdentityRef = useRef("")
  const suppressRef = useRef(false)
  const lastSignatureRef = useRef("")
  const lastSaveErrorRef = useRef<string | null>(null)
  const loadStartedRef = useRef(false)
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
            if (mountedRef.current) setExercise(updated)
          }
        } else if (JSON.stringify(identity) !== savedIdentityRef.current) {
          // Invalid identity edit: never send it, but don't report the round as "saved"
          // either — the draft below still goes out so it isn't lost, then the round
          // fails with IdentityRejectedError so the indicator shows "not saved", the
          // leave guard stays armed and the buffer (holding the invalid identity) is kept.
          identityRejected = true
        }
      }
      const payload = draftForm.getValues()
      const sent = capturedDraftIds(payload)
      const saved = await saveDraft(id, toSaveDraftInput(payload))
      rememberDraftVersion(saved.ID)
      const updates = serverIdUpdates(sent, saved, draftForm.getValues())
      if (updates.length > 0) {
        suppressRef.current = true
        for (const update of updates) draftForm.setValue(update.path, update.value)
        suppressRef.current = false
        lastSignatureRef.current = signature()
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
      if (lastSaveErrorRef.current !== message) {
        toast.error(message)
        lastSaveErrorRef.current = message
      }
      throw error
    }
  }, [identityForm, draftForm, signature, userId, rememberDraftVersion])

  const autosave = useExerciseAutosave({
    save,
    onSaved: () => {
      const id = exerciseIdRef.current
      if (id) void getExercise(id).then(setExercise).catch(() => undefined)
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
      saveDraftKeepalive(id, toSaveDraftInput(draftForm.getValues()))
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
            toast.success(t("admin.exPage.toast.pendingRestored"))
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
            applyValues(identityOf(loaded), workingCopyValues(loadedVersion))
            setLoadState("ready")
            return
          }
          const key = !versionId ? pendingBufferKey(knownUserId, exerciseId) : null
          const pending = key ? readPendingChanges(key) : null
          const apply = pending !== null && canWrite && !loaded.ArchivedAt
          if (key && pending && !apply) clearPendingChanges(key)
          setExercise(loaded)
          setVersion(loadedVersion)
          if (!versionId) rememberDraftVersion(loadedVersion.ID)
          savedIdentityRef.current = JSON.stringify(identityOf(loaded))
          const serverDraft = workingCopyValues(loadedVersion)
          applyValues(apply ? pending.identity : identityOf(loaded), apply ? mergePendingDraft(serverDraft, pending.draft) : serverDraft)
          setLoadState("ready")
          if (apply) {
            toast.success(t("admin.exPage.toast.pendingRestored"))
            optionsRef.current.onPendingRestored()
            setRestored(true)
          }
        } catch {
          if (!cancelled) setLoadState("notFound")
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
  }, [exerciseId, versionId, userId])

  useEffect(() => {
    if (restored) autosave.markChanged()
    // Once per restore; autosave.markChanged is stable (see the watch effect below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored])

  useEffect(() => {
    if (!editable || loadState !== "ready") return
    lastSignatureRef.current = signature()
    const onChange = () => {
      if (suppressRef.current) return
      const next = signature()
      if (next === lastSignatureRef.current) return
      lastSignatureRef.current = next
      autosave.markChanged()
    }
    // eslint-disable-next-line react-hooks/incompatible-library -- Imperative form subscription; React Compiler must not memoize this effect.
    const identityWatch = identityForm.watch(onChange)
    const draftWatch = draftForm.watch(onChange)
    return () => { identityWatch.unsubscribe(); draftWatch.unsubscribe() }
    // autosave.markChanged is a useCallback with a fixed dependency chain (stable across
    // renders) even though the `autosave` object it hangs off is re-memoized on every
    // status change; depending on the whole object would resubscribe watch on every
    // "pending"/"saving"/"saved" transition for no behavioral benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, loadState, identityForm, draftForm, signature, autosave.markChanged])

  const reloadWorkingCopy = useCallback(async () => {
    const id = exerciseIdRef.current
    if (!id) return
    const [loaded, draft] = await Promise.all([getExercise(id), getDraft(id)])
    setExercise(loaded)
    setVersion(draft)
    rememberDraftVersion(draft.ID)
    savedIdentityRef.current = JSON.stringify(identityOf(loaded))
    applyValues(identityOf(loaded), workingCopyValues(draft))
  }, [applyValues, rememberDraftVersion])

  const getDraftVersionId = useCallback(() => draftVersionIdRef.current, [])

  return {
    loadState, exercise, setExercise, version, identityForm, draftForm, autosave, getDraftVersionId, reloadWorkingCopy, readOnly,
  }
}
