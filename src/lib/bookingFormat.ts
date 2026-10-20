import { formatCPU, formatMemory } from "@/lib/deviceResources"
import type { Amount } from "@/api/exercises/testLabs"
import { t } from "@/i18n/t"
import { formatExerciseDate, formatExerciseDateTime } from "@/lib/exerciseStatus"

/** "14:30" — the clock time of an RFC3339 instant in the browser's time zone. */
export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })
}

export function formatAmount(amount: Amount): { cpu: string; memory: string } {
  return { cpu: formatCPU(amount.CPUMillicores), memory: formatMemory(amount.MemoryBytes) }
}

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** A local date/time, with the short tomorrow label only when its local calendar day matches. */
export function formatBookingStart(iso: string, now: Date = new Date()): string {
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  return sameLocalDay(new Date(iso), tomorrow) ? t("exercises.book.tomorrow", { time: formatClock(iso) }) : formatExerciseDateTime(iso, now)
}

/** Repeat the full end date across midnight, rather than implying an end on the start day. */
export function formatBookingRange(from: string, to: string): string {
  const end = sameLocalDay(new Date(from), new Date(to)) ? formatClock(to) : t("exercises.book.dateTime", { date: formatExerciseDate(to), time: formatClock(to) })
  return t("exercises.book.range", { from: formatBookingStart(from), to: end })
}
