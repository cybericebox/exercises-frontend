import { t } from "@/i18n/t"

/** "45 min", "2 h": a length in minutes as the booking and the test run lists show it. */
export function durationLabel(minutes: number): string {
  return minutes % 60 === 0 ? t("exercises.book.duration.hours", { n: minutes / 60 }) : t("exercises.book.duration.minutes", { n: minutes })
}
