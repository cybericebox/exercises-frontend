"use client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { t } from "@/i18n/t"

export function ConfirmActionDialog({ open, title, description, confirmLabel, destructive = false, busy, onCancel, onConfirm }: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onCancel() }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>{t("admin.exPage.dialog.cancel")}</Button>
        <Button type="button" variant={destructive ? "destructive" : "default"} disabled={busy} onClick={onConfirm}>{confirmLabel}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
