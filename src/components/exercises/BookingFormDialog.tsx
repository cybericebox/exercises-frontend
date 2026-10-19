"use client"

import { useState } from "react"

import { createBooking, type Amount, type Booking } from "@/api/exercises/testLabs"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import { SelectMenu } from "@/components/ui/select-menu"
import { Label } from "@/components/ui/label"
import { t } from "@/i18n/t"
import { BOOKING_DEFAULT_MINUTES, BOOKING_MAX_ACTIVE, BOOKING_MAX_DAYS_AHEAD, BOOKING_MAX_MINUTES, BOOKING_MIN_MINUTES, bookingLimitError, type BookingLimitError } from "@/lib/bookingLimits"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"
import { isNoTestLabRoom, nearestFromError } from "@/lib/noTestLabRoom"
import { formatClock } from "@/lib/bookingFormat"
import { durationLabel } from "@/lib/durations"

const pad = (value: number) => String(value).padStart(2, "0")

/** RFC3339 → the picker's wall-clock value in the browser's time zone. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Lengths offered in the duration list, in minutes. */
const DURATION_CHOICES = [15, 30, 45, 60, 120, 240, 480]

/** The choices inside the platform limits. */
export function allowedDurations(): number[] {
  return DURATION_CHOICES.filter((m) => m >= BOOKING_MIN_MINUTES && m <= BOOKING_MAX_MINUTES)
}

/** The default length if allowed (1 h), else the nearest allowed one. */
export function defaultDuration(): number {
  const list = allowedDurations()
  return list.reduce((best, m) => Math.abs(m - 60) < Math.abs(best - 60) ? m : best, list[0] ?? BOOKING_DEFAULT_MINUTES)
}

const DAY_MS = 24 * 60 * 60 * 1000

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
  const [minutes, setMinutes] = useState(String(defaultDuration()))
  const [latest] = useState(() => new Date(Date.now() + BOOKING_MAX_DAYS_AHEAD * DAY_MS))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const startIso = (() => { const at = new Date(startValue); return Number.isNaN(at.getTime()) ? "" : at.toISOString() })()
  const limit = bookingLimitError(startIso, Number(minutes), active)

  async function submit() {
    if (limit) return
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

  return <ConfirmDialog open={open} busy={busy} error={limit === "tooMany" ? limitMessage(limit) : error} title={t("exercises.book.title")} description={t("exercises.book.description")}
    confirmLabel={t("exercises.book.confirm")} busyLabel={t("exercises.book.booking")} cancelLabel={t("admin.exPage.dialog.cancel")} onCancel={onCancel} onConfirm={() => void submit()}>
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="booking-start">{t("exercises.book.start")}</Label>
        <DateTimePicker id="booking-start" max={latest} aria-label={t("exercises.book.start")} value={startValue} aria-invalid={limit === "past" || limit === "ahead"}
          aria-describedby={limit === "past" || limit === "ahead" ? "booking-start-error" : undefined} onChange={(value) => { setStartValue(value); setError("") }} />
        {(limit === "past" || limit === "ahead") && <p id="booking-start-error" role="alert" className="text-xs text-destructive">{limitMessage(limit)}</p>}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="booking-minutes">{t("exercises.book.minutes")}</Label>
        <SelectMenu id="booking-minutes" ariaLabel={t("exercises.book.minutes")} value={minutes} options={allowedDurations().map((m) => ({ value: String(m), label: durationLabel(m) }))}
          aria-invalid={limit === "duration"} aria-describedby={limit === "duration" ? "booking-minutes-hint booking-minutes-error" : "booking-minutes-hint"} onChange={(value) => { setMinutes(value); setError("") }} />
        <p id="booking-minutes-hint" className="text-xs text-muted-foreground">{t("exercises.book.hint", { days: BOOKING_MAX_DAYS_AHEAD, count: BOOKING_MAX_ACTIVE })}</p>
        {limit === "duration" && <p id="booking-minutes-error" role="alert" className="text-xs text-destructive">{limitMessage(limit)}</p>}
      </div>
    </div>
  </ConfirmDialog>
}
