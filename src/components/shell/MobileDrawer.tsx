"use client"

import * as DialogPrimitive from "@radix-ui/react-dialog"
import { t } from "@/i18n/t"
import { Sidebar } from "./Sidebar"

export function MobileDrawer({ open, onOpenChange, onReturnFocus }: { open: boolean; onOpenChange: (open: boolean) => void; onReturnFocus: () => void }) {
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="ib-overlay-in fixed inset-0 z-50 bg-[var(--ib-backdrop)]" />
      <DialogPrimitive.Content aria-describedby={undefined} className="fixed inset-y-0 left-0 z-50 h-dvh w-fit max-w-[calc(100vw-3rem)] outline-none"
        onCloseAutoFocus={(event) => { event.preventDefault(); onReturnFocus() }}>
        <DialogPrimitive.Title className="sr-only">{t("exercises.nav.label")}</DialogPrimitive.Title>
        <Sidebar onClose={() => onOpenChange(false)} onNavigate={() => onOpenChange(false)} />
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>
}
