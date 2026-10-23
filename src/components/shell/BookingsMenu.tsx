"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { CalendarClock, X } from "lucide-react"

import { getExerciseCapabilities, type ResourcesConfig } from "@/api/exercises/capabilities"
import { cancelBooking, getRoom, listBookings, type Booking, type Room } from "@/api/exercises/testLabs"
import { BookingFormDialog } from "@/components/exercises/BookingFormDialog"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { GuideLink } from "@/components/exercises/GuideLink"
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadError } from "@/components/ui/load-error"
import { LoadingArea } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { t } from "@/i18n/t"
import { BOOKING_MAX_ACTIVE } from "@/lib/bookingLimits"
import { formatAmount, formatBookingRange, formatBookingStart, formatClock } from "@/lib/bookingFormat"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"
import "@/styles/bookings.css"

type Load = { state: "loading" } | { state: "error"; cause: unknown } | { state: "ready"; items: Booking[]; room: Room | null; config: ResourcesConfig | null; asOf: number }

/**
 * The sidebar's «Бронювання»: the author's upcoming test lab bookings (cancel, add) and whether
 * there is room for a test lab right now (the largest a platform device may be is the yardstick).
 */
export function BookingsMenu({ trigger = true, open: controlled, onOpenChange, onCloseAutoFocus }: {
  /** false: no sidebar button; the phone menu opens the dialog through open/onOpenChange. */
  trigger?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Where focus goes when the dialog closes (its trigger may be gone with the phone menu). */
  onCloseAutoFocus?: () => void
} = {}) {
  const [load, setLoad] = useState<Load>({ state: "loading" })
  const [own, setOwn] = useState(false)
  const open = controlled ?? own
  const setOpen = (next: boolean) => { setOwn(next); onOpenChange?.(next) }
  const [opened, setOpened] = useState(open)
  // Opened from outside: the list starts loading like after a click on the trigger.
  if (open !== opened) {
    setOpened(open)
    if (open) setLoad({ state: "loading" })
  }
  const [cancelling, setCancelling] = useState<Booking | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  // The suggested start of a new booking; set when «Нове бронювання» is pressed (null: the form is closed).
  const newBookingRef = useRef<HTMLButtonElement>(null)
  const [addStart, setAddStart] = useState<string | null>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const headerActionsRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const cancelReturnRef = useRef<HTMLButtonElement | null>(null)
  const cancelIndexRef = useRef(0)
  const pendingFocus = useRef<{ id: string; index: number; element: HTMLButtonElement | null; restore: boolean } | null>(null)
  const [announcement, setAnnouncement] = useState("")
  const [overflow, setOverflow] = useState(false)
  const focusRow = useCallback((index: number) => {
    const actions = bodyRef.current?.querySelectorAll<HTMLButtonElement>("[data-booking-cancel]")
    const next = actions?.[Math.min(index, actions.length - 1)] ?? newBookingRef.current ?? titleRef.current
    next?.focus()
  }, [])

  const refresh = useCallback(async () => {
    try {
      const [items, caps] = await Promise.all([listBookings(), getExerciseCapabilities()])
      const frame = caps.Resources.Frame
      // Availability is a hint: its failure never hides the list.
      const room = await getRoom(frame, frame).catch(() => null)
      const pending = pendingFocus.current
      // Capture ownership before React removes the row and the browser moves its focus to body.
      if (pending && !items.some((item) => item.ID === pending.id)) pending.restore = document.activeElement === pending.element
      setLoad({ state: "ready", items, room, config: caps.Resources, asOf: Date.now() })
    } catch (cause) {
      setLoad({ state: "error", cause })
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads when the dialog opens
    if (open) void refresh()
  }, [open, refresh])

  useEffect(() => {
    if (!open) { pendingFocus.current = null; return }
    const pending = pendingFocus.current
    if (pending && load.state === "ready" && !load.items.some((item) => item.ID === pending.id)) {
      const active = document.activeElement
      const dialog = bodyRef.current?.closest('[role="dialog"]')
      const listActive = !cancelling && !addStart && dialog && !dialog.closest('[aria-hidden="true"], [inert]')
      if (pending.restore && listActive && (active === pending.element || active === document.body || active === dialog)) focusRow(pending.index)
      pendingFocus.current = null
    }
  }, [load, open, cancelling, addStart, focusRow])

  useEffect(() => {
    const body = bodyRef.current
    if (!open || !body) return
    const check = () => setOverflow(body.scrollHeight > body.clientHeight)
    queueMicrotask(check)
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(check)
    observer?.observe(body)
    return () => observer?.disconnect()
  }, [open, load])

  async function cancel() {
    if (!cancelling) return
    setBusy(true)
    setError("")
    try {
      await cancelBooking(cancelling.ID)
      pendingFocus.current = { id: cancelling.ID, index: cancelIndexRef.current, element: cancelReturnRef.current, restore: false }
      setCancelling(null)
      setAnnouncement(t("exercises.book.cancelled"))
      void refresh()
    } catch (cause) {
      setError(exerciseErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const items = load.state === "ready" ? load.items : []
  const asOf = load.state === "ready" ? load.asOf : 0
  return <>
    <Dialog open={open} onOpenChange={(next) => { if (next) setLoad({ state: "loading" }); setOpen(next) }}>
      {trigger && <DialogTrigger asChild>
        <button type="button" className="ib-admin-side__item">
          <CalendarClock aria-hidden="true" /><span className="ib-admin-side__label">{t("exercises.book.menu")}</span>
        </button>
      </DialogTrigger>}
      <DialogContent className="bookings-dialog max-w-lg text-foreground" aria-describedby={undefined}
        onOpenAutoFocus={(event) => { event.preventDefault(); titleRef.current?.focus() }}
        onEscapeKeyDown={(event) => {
          const descriptions = headerActionsRef.current?.querySelector("a")?.getAttribute("aria-describedby")?.split(/\s+/) ?? []
          if (descriptions.some((id) => document.getElementById(id)?.getAttribute("role") === "tooltip")) event.preventDefault()
        }}
        onCloseAutoFocus={onCloseAutoFocus ? (event) => { event.preventDefault(); onCloseAutoFocus() } : undefined}>
        <header className="bookings-header">
          <DialogTitle ref={titleRef} tabIndex={-1} className="bookings-title">{t("exercises.book.listTitle")}</DialogTitle>
          <div ref={headerActionsRef} className="bookings-header-actions"><GuideLink topic="infrastruktura" variant="dialog" />
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="icon" aria-label={t("exercises.book.close")}><X aria-hidden="true" className="h-4 w-4" /></Button>
          </DialogClose>
          </div>
        </header>
        <div ref={bodyRef} className="bookings-body" aria-busy={load.state === "loading"}>
          {load.state === "loading" ? <LoadingArea className="bookings-state min-h-0" label={t("admin.loading")} />
            : load.state === "error" ? <LoadError className="bookings-state min-h-0" error={load.cause} message={t("exercises.book.loadFailed")} onRetry={() => { setLoad({ state: "loading" }); void refresh() }} />
            : <>
              {load.room && !load.room.Available && <p data-room className="bookings-room">
                {load.room.NearestFrom ? t("exercises.book.room.none", { time: formatBookingStart(load.room.NearestFrom) }) : t("exercises.book.room.noneNoWindow")}
              </p>}
              {items.length === 0 ? <EmptyState className="bookings-state min-h-0" message={t("exercises.book.empty")} /> : <ul className="bookings-list">
                {items.map((item, index) => {
                  const size = formatAmount(item.Size)
                  const windowState = new Date(item.From).getTime() > asOf ? "scheduled" : new Date(item.To).getTime() > asOf ? "current" : null
                  const range = formatBookingRange(item.From, item.To)
                  return <li key={item.ID} className="bookings-row">
                    <div className="min-w-0">
                      <div className="bookings-time">{range}</div>
                      {windowState && <p className="bookings-window" data-current={windowState === "current" || undefined}>{t(`exercises.book.window.${windowState}`)}</p>}
                      <p className="bookings-resources">{t("exercises.book.allocation", size)}</p>
                    </div>
                      <Button type="button" variant="ghost" size="sm" className="bookings-cancel" data-booking-cancel aria-label={t("exercises.book.cancelNamed", { time: range })}
                        onClick={(event) => { cancelReturnRef.current = event.currentTarget; cancelIndexRef.current = index; setAnnouncement(""); setError(""); setCancelling(item) }}>
                        {t("exercises.book.cancelShort")}
                      </Button>
                  </li>
                })}
              </ul>}
            </>}
        </div>
        <footer className="bookings-footer" data-overflow={overflow || undefined}>
          {load.state === "ready" && <>
            <div className="bookings-footer-copy"><p className="bookings-used">{t("exercises.book.used", { n: items.length, max: BOOKING_MAX_ACTIVE })}</p>
              {items.length >= BOOKING_MAX_ACTIVE && <p id="bookings-limit" className="bookings-limit">{t("exercises.book.limitReached")}</p>}
            </div>
            <Button ref={newBookingRef} type="button" size="sm" className="bookings-new" aria-describedby={items.length >= BOOKING_MAX_ACTIVE ? "bookings-limit" : undefined} disabled={!load.config || items.length >= BOOKING_MAX_ACTIVE} onClick={() => setAddStart(load.room?.NearestFrom ?? new Date(Math.ceil((Date.now() + 15 * 60_000) / 900_000) * 900_000).toISOString())}>{t("exercises.book.new")}</Button>
          </>}
        </footer>
        <span className="sr-only" role="status">{announcement}</span>
      </DialogContent>
    </Dialog>
    <ConfirmDialog open={cancelling !== null} tone="danger" busy={busy} error={error} title={t("exercises.book.cancelTitle")}
      description={<>{t("exercises.book.cancelDescription")}{cancelling && <span className="mt-3 block">{formatBookingRange(cancelling.From, cancelling.To)}</span>}</>} confirmLabel={t("exercises.book.cancel")} busyLabel={t("exercises.book.cancelling")} cancelLabel={t("exercises.book.keep")}
      onCloseAutoFocus={(event) => { event.preventDefault(); if (cancelReturnRef.current?.isConnected) cancelReturnRef.current.focus(); else focusRow(cancelIndexRef.current) }}
      onCancel={() => setCancelling(null)} onConfirm={() => void cancel()} />
    {addStart && load.state === "ready" && load.config && <BookingFormDialog open start={addStart}
      size={load.config.Frame} largestDevice={load.config.Frame} active={load.items.length}
      onCloseAutoFocus={(event) => { event.preventDefault(); newBookingRef.current?.focus() }}
      onCancel={() => setAddStart(null)}
      onBooked={(created) => { setAddStart(null); toast.success(t("exercises.book.booked", { time: formatClock(created.From) })); void refresh() }} />}
  </>
}
