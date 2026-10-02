/**
 * bookingLimits.ts — the limits of a test lab booking, checked before the request so the
 * author sees the reason at once. The server enforces the same (22512).
 */
export const BOOKING_MIN_MINUTES = 15
export const BOOKING_MAX_MINUTES = 480
export const BOOKING_MAX_DAYS_AHEAD = 14
export const BOOKING_MAX_ACTIVE = 3
/** Default length of a booking made from «no free resources» (2 hours). */
export const BOOKING_DEFAULT_MINUTES = 120

const DAY_MS = 24 * 60 * 60 * 1000

export type BookingLimitError = "duration" | "past" | "ahead" | "tooMany"

/** The first limit the booking breaks, or null. `start` is an RFC3339 time; `active` counts the author's bookings. */
export function bookingLimitError(start: string, minutes: number, active: number, now: Date = new Date()): BookingLimitError | null {
  if (active >= BOOKING_MAX_ACTIVE) return "tooMany"
  if (!Number.isInteger(minutes) || minutes < BOOKING_MIN_MINUTES || minutes > BOOKING_MAX_MINUTES) return "duration"
  const at = new Date(start).getTime()
  if (Number.isNaN(at) || at < now.getTime() - 60_000) return "past"
  if (at > now.getTime() + BOOKING_MAX_DAYS_AHEAD * DAY_MS) return "ahead"
  return null
}
