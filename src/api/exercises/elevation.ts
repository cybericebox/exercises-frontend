/**
 * elevation.ts — resource elevation requests for the working copy of an exercise.
 *
 * Routes: GET/POST /api/exercises/:id/elevation. An author asks per task version, with a
 * reason; a platform admin approves or rejects in admin. The approval stores the approved
 * values per device; a later version keeps it while every value stays at or below them.
 */
import { apiGet, apiPost } from "@/api/client"
import type { ElevationStatus, ElevationValue } from "@/lib/deviceResources"

export type { ElevationStatus, ElevationValue }

export type Elevation = {
  Status: ElevationStatus
  Reason: string
  /** What the author asked for (pending, rejected) or the last request. */
  Requested: ElevationValue[]
  /** The approved values per device; kept while a later request is pending or rejected. */
  Approved: ElevationValue[]
  ReviewNote: string
  RequestedAt: string | null
  ReviewedAt: string | null
}

type RawElevation = Partial<Elevation> | null

function normalize(raw: RawElevation): Elevation {
  return {
    Status: raw?.Status ?? "none",
    Reason: raw?.Reason ?? "",
    Requested: raw?.Requested ?? [],
    Approved: raw?.Approved ?? [],
    ReviewNote: raw?.ReviewNote ?? "",
    RequestedAt: raw?.RequestedAt ?? null,
    ReviewedAt: raw?.ReviewedAt ?? null,
  }
}

export async function getElevation(exerciseId: string): Promise<Elevation> {
  return normalize(await apiGet<RawElevation>(`/api/exercises/${exerciseId}/elevation`))
}

export async function requestElevation(exerciseId: string, input: { Reason: string; Devices: ElevationValue[] }): Promise<Elevation> {
  return normalize(await apiPost<RawElevation>(`/api/exercises/${exerciseId}/elevation`, input))
}
