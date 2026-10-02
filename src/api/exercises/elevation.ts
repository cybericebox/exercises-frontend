/**
 * elevation.ts — resource elevation requests of an exercise (devices above the platform frame).
 *
 * Routes: GET/POST /api/exercises/:id/elevation {Reason}; POST covers the working copy's outside-frame
 * devices that no approval covers yet. The latest request travels with every version response
 * (Version.Elevation); a platform admin decides in admin.
 */
import { apiPost } from "@/api/client"
import type { ResourceAmount } from "./capabilities"

export type ElevationStatus = "pending" | "approved" | "rejected"
/** What a device asks for or was approved: a block count and its size. */
export type ElevationDevice = { DeviceID: string; Name: string; Blocks: number } & ResourceAmount

export type Elevation = {
  ID: string
  ExerciseID: string
  ExerciseName: string
  VersionID: string
  Status: ElevationStatus
  Reason: string
  Requested: ElevationDevice[]
  Approved: ElevationDevice[]
  DecisionNote: string
  RequestedByName: string
  RequestedAt: string
  DecidedByName: string
  DecidedAt: string | null
}

type RawElevation = Partial<Elevation> & Pick<Elevation, "ID" | "Status">

export function normalizeElevation(raw: RawElevation): Elevation {
  return {
    ID: raw.ID, ExerciseID: raw.ExerciseID ?? "", ExerciseName: raw.ExerciseName ?? "", VersionID: raw.VersionID ?? "",
    Status: raw.Status, Reason: raw.Reason ?? "", Requested: raw.Requested ?? [], Approved: raw.Approved ?? [],
    DecisionNote: raw.DecisionNote ?? "", RequestedByName: raw.RequestedByName ?? "", RequestedAt: raw.RequestedAt ?? "",
    DecidedByName: raw.DecidedByName ?? "", DecidedAt: raw.DecidedAt ?? null,
  }
}

export async function requestElevation(exerciseId: string, reason: string): Promise<Elevation> {
  return normalizeElevation(await apiPost<RawElevation>(`/api/exercises/${exerciseId}/elevation`, { Reason: reason }))
}
