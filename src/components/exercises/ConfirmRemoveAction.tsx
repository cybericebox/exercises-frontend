"use client"

import { useRef, useState, type ComponentProps } from "react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { t } from "@/i18n/t"
import { RemoveAction } from "./RemoveAction"

/** Keep the row untouched until its removal is explicitly confirmed. */
export function ConfirmRemoveAction({ onClick, ...props }: ComponentProps<typeof RemoveAction>) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const removed = useRef(false)
  return <>
    <RemoveAction {...props} buttonRef={triggerRef} onClick={() => { removed.current = false; setOpen(true) }} />
    <ConfirmDialog open={open} onCloseAutoFocus={(event) => { event.preventDefault(); if (!removed.current) triggerRef.current?.focus() }} onCancel={() => setOpen(false)} tone="danger"
      title={t("admin.ex.removeTitle")} description={t("admin.ex.removeDescription")}
      confirmLabel={props.ariaLabel} onConfirm={() => { removed.current = true; setOpen(false); onClick() }} />
  </>
}
