"use client"

import { useState } from "react"
import { proposeExercise, type Proposal } from "@/api/exercises/proposals"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { toastApiError } from "@/components/ui/toastApiError"
import { t } from "@/i18n/t"

export const PROPOSAL_NOTE_LIMIT = 2000

/** Managers: propose a published event exercise to the platform catalog. */
export function ProposeDialog({ exerciseId, onClose, onProposed }: {
  exerciseId: string
  onClose: () => void
  onProposed: (proposal: Proposal) => void
}) {
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const tooLong = note.trim().length > PROPOSAL_NOTE_LIMIT

  async function submit() {
    setBusy(true)
    try {
      const proposal = await proposeExercise(exerciseId, note)
      toast.success(t("exercises.propose.sent"))
      onProposed(proposal)
    } catch (error) {
      toastApiError(error, () => void submit())
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("exercises.propose.title")}</DialogTitle>
          <DialogDescription>{t("exercises.propose.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="proposal-note">{t("exercises.propose.note")}</Label>
          <Textarea id="proposal-note" rows={4} value={note} aria-invalid={tooLong} aria-describedby={tooLong ? "proposal-note-error" : undefined} onChange={(event) => setNote(event.target.value)} />
          {tooLong && <p id="proposal-note-error" role="alert" className="text-xs text-destructive">{t("exercises.propose.noteTooLong")}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t("admin.exPage.dialog.cancel")}</Button>
          <Button type="button" disabled={busy || tooLong} onClick={() => void submit()}>{t("exercises.propose.submit")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
