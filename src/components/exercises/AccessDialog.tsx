"use client"

import { useEffect, useRef, useState } from "react"
import { setExerciseAccess, type AccessInput, type Exercise, type ExerciseOwnership } from "@/api/exercises/catalog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "@/components/ui/toast"
import { toastApiError } from "@/components/ui/toastApiError"
import { t } from "@/i18n/t"
import { ERR_ACCESS_INVALID, exerciseErrorCode, exerciseErrorMessage } from "@/lib/exerciseErrors"
import { AccessLevelFields, accessValueValid, type AccessValue } from "./AccessLevelFields"

function accessOf(exercise: Exercise): AccessValue {
  return {
    level: exercise.AccessLevel === "own" && !exercise.OriginEventID ? "all" : exercise.AccessLevel || "all",
    eventIds: exercise.AccessEventIDs,
  }
}

function accessInput(value: AccessValue): AccessInput {
  return { AccessLevel: value.level, EventIDs: value.level === "selected" ? [...new Set(value.eventIds)].sort() : [] }
}

const sameAccess = (left: AccessValue, right: AccessValue) => JSON.stringify(accessInput(left)) === JSON.stringify(accessInput(right))

/** Admins: which events may use a catalog exercise (PUT :id/access). */
export function AccessDialog({ exercise, originEventName, onClose, onSaved }: {
  exercise: Exercise
  originEventName?: string
  onClose: () => void
  onSaved: (exercise: Exercise) => void
}) {
  const allowOwn = Boolean(exercise.OriginEventID)
  const [value, setValue] = useState<AccessValue>(() => accessOf(exercise))
  const valueRef = useRef(value)
  const [baseline, setBaseline] = useState(value)
  const baselineRef = useRef(baseline)
  const observedRef = useRef(baseline)
  const savingRef = useRef(false)
  const mountedRef = useRef(true)
  const [accessError, setAccessError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const dirty = !sameAccess(value, baseline)

  function change(next: AccessValue) {
    setAccessError(null)
    valueRef.current = next
    setValue(next)
  }

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    const next = accessOf(exercise)
    if (sameAccess(next, observedRef.current)) return
    observedRef.current = next
    if (sameAccess(valueRef.current, baselineRef.current)) {
      valueRef.current = next
      setValue(next)
    }
    baselineRef.current = next
    setBaseline(next)
  }, [exercise])

  async function save() {
    const sent = valueRef.current
    if (savingRef.current || !accessValueValid(sent) || sameAccess(sent, baselineRef.current)) return
    savingRef.current = true
    setBusy(true)
    setAccessError(null)
    try {
      const updated = await setExerciseAccess(exercise.ID, accessInput(sent))
      const acknowledged = accessOf(updated)
      baselineRef.current = acknowledged
      if (mountedRef.current) setBaseline(acknowledged)
      toast.success(t("exercises.access.saved"))
      onSaved(updated)
      if (mountedRef.current && sameAccess(valueRef.current, sent)) onClose()
    } catch (error) {
      if (exerciseErrorCode(error) === ERR_ACCESS_INVALID) setAccessError(exerciseErrorMessage(error))
      else toastApiError(error, () => void save())
    } finally {
      savingRef.current = false
      if (mountedRef.current) setBusy(false)
    }
  }

  return <AccessDialogFrame value={value} onChange={change} error={accessError} allowOwn={allowOwn} originEventName={originEventName}
    knownEvents={exercise.AccessEvents} busy={busy} saveLabel={t(busy ? "exercises.access.saving" : "exercises.access.save")}
    saveDisabled={!dirty || !accessValueValid(value)} onSave={() => void save()} onClose={onClose} />
}

/** The access dialog itself: one exercise's card and the catalog table's bulk action show the same fields. */
function AccessDialogFrame({ value, onChange, error, allowOwn, originEventName, knownEvents, description, busy, saveLabel, saveDisabled, onSave, onClose }: {
  value: AccessValue
  onChange: (value: AccessValue) => void
  error: string | null
  allowOwn: boolean
  originEventName?: string
  knownEvents?: { ID: string; Name: string }[]
  description?: string
  busy: boolean
  saveLabel: string
  saveDisabled: boolean
  onSave: () => void
  onClose: () => void
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("exercises.access.dialogTitle")}</DialogTitle>
          <DialogDescription>{description ?? t("exercises.access.dialogDescription")}</DialogDescription>
        </DialogHeader>
        <AccessLevelFields error={error} value={value} onChange={onChange} allowOwn={allowOwn} originEventName={originEventName} knownEvents={knownEvents} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>{t("admin.exPage.dialog.cancel")}</Button>
          <div className="min-h-10 sm:min-w-36">
            <Button type="button" className="w-full" busy={busy} disabled={saveDisabled} onClick={onSave}>{saveLabel}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The shared access of the selected tasks: the level they all have, else «all»; the events are picked anew. */
export function bulkInitialAccess(items: Pick<ExerciseOwnership, "AccessLevel" | "OriginEventID">[]): AccessValue {
  const levels = new Set(items.map((item) => item.AccessLevel === "own" && !item.OriginEventID ? "all" : item.AccessLevel || "all"))
  const [only] = levels
  return { level: levels.size === 1 && only ? only : "all", eventIds: [] }
}

/**
 * The catalog table's «Змінити доступ»: the same dialog for every selected task (PUT bulk/access). apply runs the
 * selection and reports the progress; the dialog shows it on the button («Змінюємо доступ… 3/10»).
 */
export function BulkAccessDialog({ items, progress, onApply, onClose }: {
  items: (Pick<ExerciseOwnership, "AccessLevel" | "OriginEventID" | "AccessEvents">)[]
  progress: { done: number; total: number } | null
  onApply: (input: AccessInput) => void
  onClose: () => void
}) {
  const [value, setValue] = useState<AccessValue>(() => bulkInitialAccess(items))
  const knownEvents = [...new Map(items.flatMap((item) => item.AccessEvents).map((event) => [event.ID, event])).values()]
  const busy = progress !== null
  return <AccessDialogFrame value={value} onChange={setValue} error={null} allowOwn={items.some((item) => Boolean(item.OriginEventID))}
    knownEvents={knownEvents} description={t("exercises.bulk.access.description", { count: items.length })} busy={busy}
    saveLabel={progress ? t("exercises.bulk.access.busy", { done: progress.done, total: progress.total }) : t("exercises.access.save")}
    saveDisabled={!accessValueValid(value)} onSave={() => onApply(accessInput(value))} onClose={onClose} />
}
