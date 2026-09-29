"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { t } from "@/i18n/t"

// ds-v2 confirm dialog: a question as the title, one or two lines about the
// consequence, «Скасувати» + the action. tone="danger" makes the action the
// solid danger button. Focus starts on «Скасувати»; Esc and the backdrop
// cancel unless the action is running. Errors stay inside the dialog.
export function ConfirmDialog({ open, onCancel, title, description, confirmLabel, cancelLabel, tone = "default", busy = false, disabled = false, error, onConfirm, children }: {
  open: boolean
  onCancel: () => void
  title: string
  description?: React.ReactNode
  confirmLabel: string
  cancelLabel?: string
  tone?: "default" | "danger"
  busy?: boolean
  disabled?: boolean
  error?: React.ReactNode
  onConfirm: () => void
  children?: React.ReactNode
}) {
  const cancelRef = React.useRef<HTMLButtonElement>(null)
  return <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onCancel() }}>
    <DialogContent className="max-w-md" onOpenAutoFocus={(event) => { event.preventDefault(); cancelRef.current?.focus() }}
      {...(description ? {} : { "aria-describedby": undefined })}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      {children}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button ref={cancelRef} type="button" variant="outline" disabled={busy} onClick={onCancel}>{cancelLabel ?? t("confirm.cancel")}</Button>
        <Button type="button" variant={tone === "danger" ? "destructive" : "default"} busy={busy} disabled={disabled} onClick={onConfirm}>{confirmLabel}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
