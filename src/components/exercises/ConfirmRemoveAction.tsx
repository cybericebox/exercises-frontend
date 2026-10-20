"use client"

import { useState, type ComponentProps } from "react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { t } from "@/i18n/t"
import { RemoveAction } from "./RemoveAction"

/** Keep the row untouched until its removal is explicitly confirmed. */
export function ConfirmRemoveAction({ onClick, ...props }: ComponentProps<typeof RemoveAction>) {
  const [open, setOpen] = useState(false)
  return <>
    <RemoveAction {...props} onClick={() => setOpen(true)} />
    <ConfirmDialog open={open} onCancel={() => setOpen(false)} tone="danger"
      title={t("admin.ex.removeTitle")} description={t("admin.ex.removeDescription")}
      confirmLabel={props.ariaLabel} onConfirm={() => { setOpen(false); onClick() }} />
  </>
}
