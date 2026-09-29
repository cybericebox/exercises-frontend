/**
 * access.ts — the caller's rights in the exercise catalog app.
 *
 * GET /api/exercises/access → {IsAdmin, CanCreateCatalog, CanPublish, CanDelete, CanExport, Events}.
 * Events are the events where the caller is owner/manager/viewer; CanWrite = owner|manager.
 */
import { apiGet } from "@/api/client"

export type AccessEvent = {
  ID: string
  Name: string
  Tag: string
  CanWrite: boolean
  InfrastructureAllowed: boolean
}

export type ExerciseAccess = {
  IsAdmin: boolean
  CanCreateCatalog: boolean
  CanPublish: boolean
  CanDelete: boolean
  CanExport: boolean
  Events: AccessEvent[]
}

type RawAccess = Partial<Omit<ExerciseAccess, "Events">> & { Events?: Partial<AccessEvent>[] | null }

export function normalizeAccess(raw: RawAccess | null | undefined): ExerciseAccess {
  return {
    IsAdmin: raw?.IsAdmin ?? false,
    CanCreateCatalog: raw?.CanCreateCatalog ?? false,
    CanPublish: raw?.CanPublish ?? false,
    CanDelete: raw?.CanDelete ?? false,
    CanExport: raw?.CanExport ?? false,
    Events: (raw?.Events ?? []).filter((event) => event.ID).map((event) => ({
      ID: event.ID ?? "",
      Name: event.Name ?? "",
      Tag: event.Tag ?? "",
      CanWrite: event.CanWrite ?? false,
      InfrastructureAllowed: event.InfrastructureAllowed ?? false,
    })),
  }
}

/** GET /api/exercises/access */
export async function getExerciseAccess(): Promise<ExerciseAccess> {
  return normalizeAccess(await apiGet<RawAccess | null>("/api/exercises/access"))
}
