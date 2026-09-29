import { apiGet } from "@/api/client"

export type ExerciseCapabilities = { Laboratories: boolean }

/** Editor-only capability: does not expose agent inventory or monitoring. */
export function getExerciseCapabilities(): Promise<ExerciseCapabilities> {
  return apiGet<ExerciseCapabilities>("/api/exercises/capabilities")
}
