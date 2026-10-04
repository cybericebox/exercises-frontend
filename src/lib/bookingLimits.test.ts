import { describe, expect, it } from "vitest"
import { bookingLimitError } from "./bookingLimits"

const now = new Date("2026-10-05T10:00:00Z")
const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000).toISOString()

describe("bookingLimitError", () => {
  it("accepts a booking inside every limit", () => {
    expect(bookingLimitError(at(30), 120, 2, now)).toBeNull()
  })
  it("keeps the length between 15 and 480 minutes", () => {
    expect(bookingLimitError(at(30), 14, 0, now)).toBe("duration")
    expect(bookingLimitError(at(30), 15, 0, now)).toBeNull()
    expect(bookingLimitError(at(30), 480, 0, now)).toBeNull()
    expect(bookingLimitError(at(30), 481, 0, now)).toBe("duration")
    expect(bookingLimitError(at(30), 90.5, 0, now)).toBe("duration")
  })
  it("refuses a start in the past or more than 14 days ahead", () => {
    expect(bookingLimitError(at(-30), 60, 0, now)).toBe("past")
    expect(bookingLimitError("", 60, 0, now)).toBe("past")
    expect(bookingLimitError(at(14 * 24 * 60), 60, 0, now)).toBeNull()
    expect(bookingLimitError(at(14 * 24 * 60 + 1), 60, 0, now)).toBe("ahead")
  })
  it("allows at most 3 bookings at once", () => {
    expect(bookingLimitError(at(30), 60, 3, now)).toBe("tooMany")
  })
})
