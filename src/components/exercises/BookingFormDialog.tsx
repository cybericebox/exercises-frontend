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
import { bookingWindow, toLocalInput } from "@/lib/bookingFormTime"
export { toLocalInput } from "@/lib/bookingFormTime"
import { durationLabel } from "@/lib/durations"

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
export function BookingFormDialog({ open, start, size, largestDevice, active, onCancel, onBooked, onCloseAutoFocus }: {
  open: boolean
  /** The suggested start, RFC3339. */
  start: string
  size: Amount
  largestDevice: Amount
  /** How many bookings the author holds now. */
  active: number
  onCancel: () => void
  onBooked: (booking: Booking) => void
  onCloseAutoFocus?: (event: Event) => void
}) {
  const [startValue, setStartValue] = useState(() => toLocalInput(start))
  const [knownStart, setKnownStart] = useState(start)
  const [minutes, setMinutes] = useState(String(defaultDuration()))
  const [latest] = useState(() => new Date(Date.now() + BOOKING_MAX_DAYS_AHEAD * DAY_MS))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  // A same-value picker emission is a no-op: retain supplied seconds and autumn fold.
  const startIso = startValue === toLocalInput(knownStart) ? knownStart : (() => { const at = new Date(startValue); return Number.isNaN(at.getTime()) ? "" : at.toISOString() })()
  const locale = t("exercises.book.locale")
  const fullTime = (iso: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "shortOffset" }).format(new Date(iso))
  const window = bookingWindow(startIso, Number(minutes))
  const windowLabel = (() => {
    if (!window) return ""
    const from = new Date(window.from), to = new Date(window.to)
    const date = (at: Date) => new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).format(at)
    const clock = (at: Date) => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(at)
    const offset = (at: Date) => new Intl.DateTimeFormat("en-US", { timeZoneName: "shortOffset" }).formatToParts(at).find((part) => part.type === "timeZoneName")?.value ?? ""
    const changesZone = from.getTimezoneOffset() !== to.getTimezoneOffset()
    const time = (at: Date) => changesZone ? t("exercises.book.timeOffset", { time: clock(at), offset: offset(at) }) : clock(at)
    return date(from) === date(to)
      ? t("exercises.book.windowSameDay", { date: date(from), from: time(from), to: time(to) })
      : t("exercises.book.windowDifferentDays", { fromDate: date(from), from: time(from), toDate: date(to), to: time(to) })
  })()
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
        if (nearest) { setKnownStart(nearest); setStartValue(toLocalInput(nearest)) }
        setError(nearest ? t("exercises.book.noRoomWindow", { time: fullTime(nearest) }) : t("exercises.book.noRoom"))
      } else setError(exerciseErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return <ConfirmDialog surfaceClassName="booking-form-dialog" bodyClassName="booking-form-body" onCloseAutoFocus={onCloseAutoFocus} open={open} busy={busy} error={limit === "tooMany" ? limitMessage(limit) : error} title={t("exercises.book.title")} description={t("exercises.book.description")}
    confirmLabel={t("exercises.book.confirm")} busyLabel={t("exercises.book.booking")} cancelLabel={t("admin.exPage.dialog.cancel")} onCancel={onCancel} onConfirm={() => void submit()}>
    <div className="booking-form-fields">
      <div className="booking-form-field">
        <Label htmlFor="booking-start">{t("exercises.book.start")}</Label>
        <DateTimePicker id="booking-start" max={latest} displayInstant={startIso} locale={locale} wrapValue describeValue aria-label={t("exercises.book.start")} value={startValue} aria-invalid={limit === "past" || limit === "ahead"}
          aria-describedby={limit === "past" || limit === "ahead" ? "booking-start-error booking-start-hint" : "booking-start-hint"} onChange={(value) => { if (value !== startValue) setKnownStart(""); setStartValue(value); setError("") }} />
        <p id="booking-start-hint" className="booking-form-hint">{t("exercises.book.startHint", { days: BOOKING_MAX_DAYS_AHEAD })}</p>
        {(limit === "past" || limit === "ahead") && <p id="booking-start-error" role="alert" className="text-xs text-destructive">{limitMessage(limit)}</p>}
      </div>
      <div className="booking-form-field">
        <Label htmlFor="booking-minutes">{t("exercises.book.minutes")}</Label>
        <SelectMenu className="w-full" id="booking-minutes" ariaLabel={t("exercises.book.minutes")} value={minutes} options={allowedDurations().map((m) => ({ value: String(m), label: durationLabel(m) }))}
          aria-invalid={limit === "duration"} aria-describedby={limit === "duration" ? "booking-minutes-error" : undefined} onChange={(value) => { setMinutes(value); setError("") }} />

        {limit === "duration" && <p id="booking-minutes-error" role="alert" className="text-xs text-destructive">{limitMessage(limit)}</p>}
      </div>
      <div className="booking-form-window">
        <p className="booking-form-preview-label">{t("exercises.book.calendarWindow")}</p>
        <p className="booking-form-range">{limit && limit !== "tooMany" || !window ? t("exercises.book.invalidWindow") : windowLabel}</p>
        {window?.rounded && (!limit || limit === "tooMany") && <p className="booking-form-hint">{t("exercises.book.rounding")}</p>}
      </div>
      {limit !== "tooMany" && <p className="booking-form-rule">{t("exercises.book.countRule", { count: BOOKING_MAX_ACTIVE })}</p>}
    </div>
  </ConfirmDialog>
}
