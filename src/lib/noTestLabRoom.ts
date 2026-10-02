/**
 * noTestLabRoom.ts — 409 72509 «no free resources for a test lab now».
 * The error context may carry the nearest free window ("nearest_from", RFC3339); when the
 * response does not expose it, the caller asks GET /test-labs/room.
 */
import { exerciseErrorCode } from "@/lib/exerciseErrors"
import type { Amount } from "@/api/exercises/testLabs"
import { deviceAmount } from "@/lib/deviceResources"
import type { ResourcesConfig } from "@/api/exercises/capabilities"
import type { NormalizedVariant, VersionResources } from "@/api/exercises/versions"
import { ApiError } from "@/api/client"

export const ERR_NO_TEST_LAB_ROOM = 72509

export function isNoTestLabRoom(error: unknown): boolean {
  return exerciseErrorCode(error) === ERR_NO_TEST_LAB_ROOM
}

type ContextBody = { Status?: { Context?: Record<string, unknown> }; Context?: Record<string, unknown> }

/** The nearest free window carried by the error, or null. */
export function nearestFromError(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null
  const body = error.body as ContextBody | null | undefined
  const value = body?.Status?.Context?.nearest_from ?? body?.Context?.nearest_from
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime()) ? value : null
}

/**
 * What a test of the variant needs: the server's total for it (else the largest variant), and the
 * largest single device (from the platform presets), which must fit one node.
 */
export function variantBookingSize(variant: NormalizedVariant, resources: VersionResources | null, config: ResourcesConfig): { size: Amount; largestDevice: Amount } {
  const own = resources?.Variants.find((entry) => entry.VariantID === variant.ID)
  const total = own ?? resources?.Max ?? null
  const devices = variant.Topology.Devices.map((device) => deviceAmount(device, config))
  const sum = devices.reduce<Amount>((acc, d) => ({ CPUMillicores: acc.CPUMillicores + d.CPUMillicores, MemoryBytes: acc.MemoryBytes + d.MemoryBytes }), { CPUMillicores: 0, MemoryBytes: 0 })
  return {
    size: total ? { CPUMillicores: total.CPUMillicores, MemoryBytes: total.MemoryBytes } : sum,
    largestDevice: devices.reduce<Amount>((acc, d) => ({ CPUMillicores: Math.max(acc.CPUMillicores, d.CPUMillicores), MemoryBytes: Math.max(acc.MemoryBytes, d.MemoryBytes) }), { CPUMillicores: 0, MemoryBytes: 0 }),
  }
}
