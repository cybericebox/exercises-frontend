import { apiGet } from "@/api/client"

export type ExerciseCapabilities = {
  Laboratories: boolean
  /** How many test labs one user may run at once (older servers: one). */
  MaxActiveTestDeploys?: number
}

/** Editor-only capability: does not expose agent inventory or monitoring. */
export function getExerciseCapabilities(): Promise<ExerciseCapabilities> {
  return apiGet<ExerciseCapabilities>("/api/exercises/capabilities")
}
