const pad = (value: number) => String(value).padStart(2, "0")

/** RFC3339 to the browser-local picker value; invalid instants stay empty. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ""
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** UTC calendar slots, matching resourceCalendar.NewBookingWindow. */
export function bookingWindow(startIso: string, minutes: number): { from: string; to: string; rounded: boolean } | null {
  const start = new Date(startIso).getTime()
  const end = start + minutes * 60_000
  if (!Number.isFinite(start) || !Number.isInteger(minutes) || minutes <= 0 || !Number.isFinite(end)) return null
  const slot = 15 * 60_000
  const from = Math.floor(start / slot) * slot
  const to = Math.ceil(end / slot) * slot
  if (!Number.isFinite(new Date(from).getTime()) || !Number.isFinite(new Date(to).getTime())) return null
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString(), rounded: from !== start || to !== end }
}
