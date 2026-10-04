"use client"

import { useState } from "react"

import { createBooking, type Amount, type Booking } from "@/api/exercises/testLabs"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { t } from "@/i18n/t"
import { BOOKING_DEFAULT_MINUTES, BOOKING_MAX_ACTIVE, BOOKING_MAX_DAYS_AHEAD, BOOKING_MAX_MINUTES, BOOKING_MIN_MINUTES, bookingLimitError, type BookingLimitError } from "@/lib/bookingLimits"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"
import { isNoTestLabRoom, nearestFromError } from "@/lib/noTestLabRoom"
import { formatClock } from "@/lib/bookingFormat"

const pad = (value: number) => String(value).padStart(2, "0")

/** RFC3339 → the value of a datetime-local input (the browser's time zone). */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const LIMIT_KEY: Record<BookingLimitError, string> = {
  duration: "exercises.book.limit.duration",
  past: "exercises.book.limit.past",
  ahead: "exercises.book.limit.ahead",
  tooMany: "exercises.book.limit.tooMany",
}

/** Limits as message variables. */
export function limitMessage(error: BookingLimitError): string {
  return t(LIMIT_KEY[error], { min: BOOKING_MIN_MINUTES, max: error === "tooMany" ? BOOKING_MAX_ACTIVE : BOOKING_MAX_MINUTES, days: BOOKING_MAX_DAYS_AHEAD })
}

/**
 * Books a time slot for the author's test labs: start and length, checked against the booking
 * limits before the request. If the window no longer fits (72509) it moves to the nearest one.
 */
export function BookingFormDialog({ open, start, size, largestDevice, active, onCancel, onBooked }: {
  open: boolean
  /** The suggested start, RFC3339. */
  start: string
  size: Amount
  largestDevice: Amount
  /** How many bookings the author holds now. */
  active: number
  onCancel: () => void
  onBooked: (booking: Booking) => void
}) {
  const [startValue, setStartValue] = useState(() => toLocalInput(start))
  const [minutes, setMinutes] = useState(String(BOOKING_DEFAULT_MINUTES))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const startIso = (() => { const at = new Date(startValue); return Number.isNaN(at.getTime()) ? "" : at.toISOString() })()
  const limit = bookingLimitError(startIso, Number(minutes), active)

  async function submit() {
    if (limit) { setError(limitMessage(limit)); return }
    setBusy(true)
    setError("")
    try {
      onBooked(await createBooking({ Start: startIso, DurationMinutes: Number(minutes), Size: size, LargestDevice: largestDevice }))
    } catch (cause) {
      if (isNoTestLabRoom(cause)) {
        const nearest = nearestFromError(cause)
        if (nearest) setStartValue(toLocalInput(nearest))
        setError(nearest ? t("exercises.book.noRoomWindow", { time: formatClock(nearest) }) : t("exercises.book.noRoom"))
      } else setError(exerciseErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return <ConfirmDialog open={open} busy={busy} error={error} title={t("exercises.book.title")} description={t("exercises.book.description")}
    confirmLabel={t("exercises.book.confirm")} cancelLabel={t("admin.exPage.dialog.cancel")} onCancel={onCancel} onConfirm={() => void submit()}>
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="booking-start">{t("exercises.book.start")}</Label>
        <Input id="booking-start" type="datetime-local" value={startValue} onChange={(event) => { setStartValue(event.target.value); setError("") }} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="booking-minutes">{t("exercises.book.minutes")}</Label>
        <Input id="booking-minutes" type="number" inputMode="numeric" min={BOOKING_MIN_MINUTES} max={BOOKING_MAX_MINUTES} step={15} value={minutes}
          aria-invalid={limit === "duration"} onChange={(event) => { setMinutes(event.target.value); setError("") }} />
        <p className="text-xs text-muted-foreground">{t("exercises.book.hint", { min: BOOKING_MIN_MINUTES, max: BOOKING_MAX_MINUTES, days: BOOKING_MAX_DAYS_AHEAD, count: BOOKING_MAX_ACTIVE })}</p>
        {limit && <p role="alert" className="text-xs text-destructive">{limitMessage(limit)}</p>}
      </div>
    </div>
  </ConfirmDialog>
}
