import type { Exercise } from "@/api/exercises/catalog"
import { t } from "@/i18n/t"

export type ExerciseBadgeKind = "none" | "published" | "changes" | "archived"

export function exerciseBadgeKind(exercise: Pick<Exercise, "ArchivedAt" | "PublishedVersionID" | "HasChanges">): ExerciseBadgeKind {
  if (exercise.ArchivedAt) return "archived"
  if (!exercise.PublishedVersionID) return "none"
  return exercise.HasChanges ? "changes" : "published"
}

/** HasChanges is also true when nothing is published yet; publishing without a draft row fails with ErrNoDraft. */
export function canPublishExercise(exercise: Pick<Exercise, "ArchivedAt" | "HasChanges">): boolean {
  return !exercise.ArchivedAt && exercise.HasChanges
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function formatExerciseDate(iso: string): string {
  return new Date(iso).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export function formatExerciseDateTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  const time = date.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })
  if (sameDay(date, now)) return t("admin.exPage.date.today", { time })
  return `${formatExerciseDate(iso)}, ${time}`
}
