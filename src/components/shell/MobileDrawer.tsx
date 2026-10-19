"use client"

import { useLayoutEffect, useState, type RefObject } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { t } from "@/i18n/t"
import { BookingsMenu } from "./BookingsMenu"
import { Sidebar } from "./Sidebar"

// The phone menu (AGENTS «Mobile menu»): an overlay over the page from under the header, which stays in place.
// Radix keeps it modal: focus is trapped, the page behind does not scroll, Esc / a tap outside / a link close it.
// «Бронювання» closes the menu first and opens its dialog from here, so two overlays never stack.
export function MobileDrawer({ open, onOpenChange, onReturnFocus, anchor }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onReturnFocus: () => void
  /** The menu button: the panel starts at the bottom edge of its header. */
  anchor?: RefObject<HTMLElement | null>
}) {
  const [top, setTop] = useState(0)
  const [bookings, setBookings] = useState(false)
  useLayoutEffect(() => {
    if (!open) return
    const header = anchor?.current?.closest("header")
    // eslint-disable-next-line react-hooks/set-state-in-effect -- measured before paint, so the panel never jumps
    setTop(Math.max(0, header?.getBoundingClientRect().bottom ?? 0))
  }, [open, anchor])
  const style = { top: `${top}px` }
  return <>
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay data-drawer-backdrop style={style} className="ib-overlay-in fixed inset-x-0 bottom-0 z-(--ib-z-dialog) bg-[var(--ib-backdrop)]" />
        <DialogPrimitive.Content aria-describedby={undefined} style={style} className="fixed bottom-0 left-0 z-(--ib-z-dialog) w-fit max-w-[calc(100vw-3rem)] outline-none"
          onCloseAutoFocus={(event) => { event.preventDefault(); if (!bookings) onReturnFocus() }}>
          <DialogPrimitive.Title className="sr-only">{t("exercises.nav.label")}</DialogPrimitive.Title>
          <Sidebar onClose={() => onOpenChange(false)} onNavigate={() => onOpenChange(false)}
            onBookings={() => { setBookings(true); onOpenChange(false) }} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
    <BookingsMenu trigger={false} open={bookings} onOpenChange={setBookings} onCloseAutoFocus={onReturnFocus} />
  </>
}
