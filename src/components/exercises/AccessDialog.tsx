"use client"

import { useEffect, useRef, useState } from "react"
import { setExerciseAccess, type AccessInput, type Exercise } from "@/api/exercises/catalog"
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

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("exercises.access.dialogTitle")}</DialogTitle>
          <DialogDescription>{t("exercises.access.dialogDescription")}</DialogDescription>
        </DialogHeader>
        <AccessLevelFields error={accessError} value={value} onChange={change} allowOwn={allowOwn} originEventName={originEventName} knownEvents={exercise.AccessEvents} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>{t("admin.exPage.dialog.cancel")}</Button>
          <div className="min-h-10 sm:min-w-24">
            <Button type="button" className="w-full" busy={busy} disabled={!dirty || !accessValueValid(value)} onClick={() => void save()}>{t("exercises.access.save")}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
