import { describe, expect, it } from "vitest"
import { bookingWindow, toLocalInput } from "./bookingFormTime"

describe("calendar reservation window", () => {
  it("rounds outward on UTC slots, including seconds and midnight", () => {
    expect(bookingWindow("2026-10-20T14:37:00Z", 60)).toEqual({ from: "2026-10-20T14:30:00.000Z", to: "2026-10-20T15:45:00.000Z", rounded: true })
    expect(bookingWindow("2026-10-20T23:45:01Z", 15)).toEqual({ from: "2026-10-20T23:45:00.000Z", to: "2026-10-21T00:15:00.000Z", rounded: true })
    expect(bookingWindow("2026-10-20T14:30:00Z", 60)).toEqual({ from: "2026-10-20T14:30:00.000Z", to: "2026-10-20T15:30:00.000Z", rounded: false })
  })
  it("never turns invalid input into a valid interval", () => {
    expect(bookingWindow("", 60)).toBeNull()
    expect(bookingWindow("invalid", 60)).toBeNull()
    expect(bookingWindow("2026-10-20T14:30:00Z", NaN)).toBeNull()
    expect(toLocalInput("invalid")).toBe("")
  })
})
