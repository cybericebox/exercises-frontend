"use client"

import { useCallback, useEffect, useState } from "react"
import { CalendarClock, X } from "lucide-react"

import { getExerciseCapabilities, type ResourcesConfig } from "@/api/exercises/capabilities"
import { cancelBooking, getRoom, listBookings, type Booking, type Room } from "@/api/exercises/testLabs"
import { BookingFormDialog } from "@/components/exercises/BookingFormDialog"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { LoadError } from "@/components/ui/load-error"
import { LoadingArea } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { t } from "@/i18n/t"
import { BOOKING_MAX_ACTIVE } from "@/lib/bookingLimits"
import { formatAmount, formatClock } from "@/lib/bookingFormat"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"
import { formatExerciseDateTime } from "@/lib/exerciseStatus"

type Load = { state: "loading" } | { state: "error"; cause: unknown } | { state: "ready"; items: Booking[]; room: Room | null; config: ResourcesConfig | null }

const VIA_KEY = { booking: "exercises.book.via.booking", pool: "exercises.book.via.pool", free: "exercises.book.via.free", "": "exercises.book.via.free" } as const

/**
 * The navbar's «Бронювання»: the author's upcoming test lab bookings (cancel, add) and whether
 * there is room for a test lab right now (the largest a platform device may be is the yardstick).
 */
export function BookingsMenu() {
  const [open, setOpen] = useState(false)
  const [load, setLoad] = useState<Load>({ state: "loading" })
  const [cancelling, setCancelling] = useState<Booking | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  // The suggested start of a new booking; set when «Нове бронювання» is pressed (null: the form is closed).
  const [addStart, setAddStart] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [items, caps] = await Promise.all([listBookings(), getExerciseCapabilities()])
      const frame = caps.Resources.Frame
      // Availability is a hint: its failure never hides the list.
      const room = await getRoom(frame, frame).catch(() => null)
      setLoad({ state: "ready", items, room, config: caps.Resources })
    } catch (cause) {
      setLoad({ state: "error", cause })
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads when the dialog opens
    if (open) void refresh()
  }, [open, refresh])

  async function cancel() {
    if (!cancelling) return
    setBusy(true)
    setError("")
    try {
      await cancelBooking(cancelling.ID)
      setCancelling(null)
      void refresh()
    } catch (cause) {
      setError(exerciseErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const items = load.state === "ready" ? load.items : []
  return <>
    <Button type="button" variant="outline" size="sm" data-bookings onClick={() => { setLoad({ state: "loading" }); setOpen(true) }}>
      <CalendarClock aria-hidden="true" size={16} className="md:mr-1.5" /><span className="sr-only md:not-sr-only">{t("exercises.book.menu")}</span>
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>{t("exercises.book.listTitle")}</DialogTitle></DialogHeader>
        <div className="flex min-h-56 flex-col">
          {load.state === "loading" ? <LoadingArea className="min-h-0 flex-1" label={t("admin.loading")} />
            : load.state === "error" ? <LoadError className="min-h-0 flex-1" error={load.cause} message={t("exercises.book.loadFailed")} onRetry={() => { setLoad({ state: "loading" }); void refresh() }} />
            : <>
              {load.room && <p data-room className="mb-3 text-sm text-muted-foreground">
                {load.room.Available
                  ? t("exercises.book.room.free", { via: t(VIA_KEY[load.room.Via]) })
                  : load.room.NearestFrom ? t("exercises.book.room.none", { time: formatClock(load.room.NearestFrom) }) : t("exercises.book.room.noneNoWindow")}
              </p>}
              {items.length === 0 ? <EmptyState className="min-h-0 flex-1" message={t("exercises.book.empty")} /> : <ul className="space-y-1.5">
                {items.map((item) => {
                  const size = formatAmount(item.Size)
                  return <li key={item.ID} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium tabular-nums text-foreground">{formatExerciseDateTime(item.From)} – {formatClock(item.To)}</div>
                      <div className="text-xs text-muted-foreground">{t("exercises.book.size", size)}</div>
                    </div>
                    <HoverTooltip text={t("exercises.book.cancel")}>
                      <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0" aria-label={t("exercises.book.cancelNamed", { time: formatClock(item.From) })}
                        onClick={() => { setError(""); setCancelling(item) }}>
                        <X aria-hidden="true" size={16} />
                      </Button>
                    </HoverTooltip>
                  </li>
                })}
              </ul>}
              <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                <span className="text-xs text-muted-foreground">{t("exercises.book.count", { n: items.length, max: BOOKING_MAX_ACTIVE })}</span>
                <Button type="button" size="sm" disabled={!load.config || items.length >= BOOKING_MAX_ACTIVE} onClick={() => setAddStart(load.room?.NearestFrom ?? new Date(Math.ceil((Date.now() + 15 * 60_000) / 900_000) * 900_000).toISOString())}>{t("exercises.book.new")}</Button>
              </div>
            </>}
        </div>
      </DialogContent>
    </Dialog>
    <ConfirmDialog open={cancelling !== null} tone="danger" busy={busy} error={error} title={t("exercises.book.cancelTitle")}
      description={t("exercises.book.cancelDescription")} confirmLabel={t("exercises.book.cancel")} cancelLabel={t("exercises.book.keep")}
      onCancel={() => setCancelling(null)} onConfirm={() => void cancel()} />
    {addStart && load.state === "ready" && load.config && <BookingFormDialog open start={addStart}
      size={load.config.Frame} largestDevice={load.config.Frame} active={load.items.length}
      onCancel={() => setAddStart(null)}
      onBooked={(created) => { setAddStart(null); toast.success(t("exercises.book.booked", { time: formatClock(created.From) })); void refresh() }} />}
  </>
}
