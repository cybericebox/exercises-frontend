/**
 * stats.ts — variant statistics of an exercise.
 *
 * Route: GET /api/exercises/:id/variant-stats. Versions come newest first; only versions
 * that were issued at least once are listed, with every variant (zeros where nothing happened).
 */
import { apiGet } from "@/api/client"
import type { VersionStatus } from "./versions"

export type VariantStats = {
  VersionID: string
  Status: VersionStatus
  CreatedAt: string
  PublishedAt: string | null
  Variants: {
    VariantID: string
    Number: number
    Issued: number
    Solved: number
    Tasks: { TaskID: string; Name: string; Solved: number }[]
  }[]
}

export async function getVariantStats(exerciseId: string): Promise<VariantStats[]> {
  const raw = await apiGet<VariantStats[] | null>(`/api/exercises/${exerciseId}/variant-stats`)
  return raw ?? []
}
