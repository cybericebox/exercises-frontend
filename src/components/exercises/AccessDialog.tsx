"use client"

import { useState } from "react"
import { setExerciseAccess, type Exercise } from "@/api/exercises/catalog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "@/components/ui/toast"
import { t } from "@/i18n/t"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"
import { AccessLevelFields, accessValueValid, type AccessValue } from "./AccessLevelFields"

/** Admins: which events may use a catalog exercise (PUT :id/access). */
export function AccessDialog({ exercise, originEventName, onClose, onSaved }: {
  exercise: Exercise
  originEventName?: string
  onClose: () => void
  onSaved: (exercise: Exercise) => void
}) {
  const allowOwn = Boolean(exercise.OriginEventID)
  const [value, setValue] = useState<AccessValue>({
    level: exercise.AccessLevel === "own" && !allowOwn ? "all" : exercise.AccessLevel || "all",
    eventIds: exercise.AccessEventIDs,
  })
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      const updated = await setExerciseAccess(exercise.ID, { AccessLevel: value.level, EventIDs: value.eventIds })
      toast.success(t("exercises.access.saved"))
      onSaved(updated)
    } catch (error) {
      toast.error(exerciseErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("exercises.access.dialogTitle")}</DialogTitle>
          <DialogDescription>{t("exercises.access.dialogDescription")}</DialogDescription>
        </DialogHeader>
        <AccessLevelFields value={value} onChange={setValue} allowOwn={allowOwn} originEventName={originEventName} disabled={busy} knownEvents={exercise.AccessEvents} />
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t("admin.exPage.dialog.cancel")}</Button>
          <Button type="button" disabled={busy || !accessValueValid(value)} onClick={() => void save()}>{t("exercises.access.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
