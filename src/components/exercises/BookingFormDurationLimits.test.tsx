import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/bookingLimits", async (original) => ({ ...(await original<typeof import("@/lib/bookingLimits")>()), BOOKING_MIN_MINUTES: 30, BOOKING_MAX_MINUTES: 120 }))

import { allowedDurations, defaultDuration } from "./BookingFormDialog"

describe("booking durations inside the platform limits", () => {
  it("offers only the allowed ones", () => {
    expect(allowedDurations()).toEqual([30, 45, 60, 120])
    expect(defaultDuration()).toBe(60)
  })
})
