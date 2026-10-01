import { apiGet } from "@/api/client"

export type ExerciseCapabilities = {
  Laboratories: boolean
  /** How many test labs one user may run at once (older servers: one). */
  MaxActiveTestDeploys?: number
  /** The platform can keep a container's state across an unplanned restart (device Persistence). */
  DevicePersistence?: boolean
}

/** Editor-only capability: does not expose agent inventory or monitoring. */
export function getExerciseCapabilities(): Promise<ExerciseCapabilities> {
  return apiGet<ExerciseCapabilities>("/api/exercises/capabilities")
}
