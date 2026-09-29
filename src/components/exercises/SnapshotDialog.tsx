"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { t } from "@/i18n/t"

/** Backend limit for POST :id/checkpoints { Note }. */
export const SNAPSHOT_NOTE_LIMIT = 500

export function SnapshotDialog({ busy, onCancel, onConfirm }: { busy: boolean; onCancel: () => void; onConfirm: (note: string) => void }) {
  const [note, setNote] = useState("")
  const tooLong = note.trim().length > SNAPSHOT_NOTE_LIMIT
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onCancel() }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t("admin.exPage.snapshot.title")}</DialogTitle>
        <DialogDescription>{t("admin.exPage.snapshot.description")}</DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label htmlFor="snapshot-note">{t("admin.exPage.snapshot.note")}</Label>
        <Textarea id="snapshot-note" rows={3} value={note} aria-invalid={tooLong} onChange={(event) => setNote(event.target.value)} />
        {tooLong && <p role="alert" className="text-xs text-destructive">{t("admin.exPage.snapshot.noteTooLong")}</p>}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>{t("admin.exPage.dialog.cancel")}</Button>
        <Button type="button" disabled={busy || tooLong} onClick={() => onConfirm(note.trim())}>{t("admin.exPage.snapshot.confirm")}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
