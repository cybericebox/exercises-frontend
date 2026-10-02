/**
 * testLabs.ts — test lab room and bookings (the resource calendar, author side).
 *
 * Routes: GET /api/exercises/test-labs/room, GET/POST /api/exercises/test-labs/bookings,
 *   DELETE /api/exercises/test-labs/bookings/:id.
 * JSON PascalCase; times are RFC3339 UTC.
 */
import { apiDelete, apiGet, apiPost } from "@/api/client"

const BASE = "/api/exercises/test-labs"

export type Amount = { CPUMillicores: number; MemoryBytes: number }

/** Where room for a test lab comes from: the author's booking, the always-on pool or unplanned free capacity. */
export type RoomVia = "booking" | "pool" | "free" | ""

export type Room = { Available: boolean; Via: RoomVia; NearestFrom: string | null }

export type Booking = { ID: string; From: string; To: string; Size: Amount }

export type BookingInput = { Start: string; DurationMinutes: number; Size: Amount; LargestDevice: Amount }

/** Is there room for a test lab of this size now; if not, the nearest window that has it. */
export function getRoom(size: Amount, largestDevice: Amount, leaseMinutes?: number): Promise<Room> {
  const params = new URLSearchParams({
    cpu: String(size.CPUMillicores),
    memory: String(size.MemoryBytes),
    deviceCpu: String(largestDevice.CPUMillicores),
    deviceMemory: String(largestDevice.MemoryBytes),
  })
  if (leaseMinutes) params.set("leaseMinutes", String(leaseMinutes))
  return apiGet<Room>(`${BASE}/room?${params}`)
}

/** The caller's own upcoming bookings. */
export async function listBookings(): Promise<Booking[]> {
  return (await apiGet<Booking[] | null>(`${BASE}/bookings`)) ?? []
}

export function createBooking(input: BookingInput): Promise<Booking> {
  return apiPost<Booking>(`${BASE}/bookings`, input)
}

export function cancelBooking(id: string): Promise<void> {
  return apiDelete<void>(`${BASE}/bookings/${encodeURIComponent(id)}`)
}
