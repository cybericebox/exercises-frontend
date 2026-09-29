/**
 * deploy.ts — per-variant test deploy.
 *
 * Routes: POST /api/exercises/:id/versions/:versionID/variants/:variantID/deploy,
 *   GET/DELETE /api/exercises/deploys/:group.
 *
 * The deploy is async: POST returns a DeployID (the lab group) immediately and the
 * lab provisions in the background; the caller polls deployStatus until Phase is
 * "Ready" (or "Failed"), then reads the CIDRs / access URLs / VPN config to
 * resolve the task placeholders inline and offer the tester their VPN.
 */
import { apiGet, apiPost, apiDelete } from "@/api/client"

const BASE = "/api/exercises"

export type DeployPhase = "Pending" | "Provisioning" | "Ready" | "Failed"

export type DeployResponse = {
  DeployID: string
  Lab: string
  VPNClient?: string
}

export type DeployDeviceStatus = { Name: string; Ready: boolean }

export type DeployAccess = {
  Device: string
  Port: number
  Protocol: string
  URL: string
}

export type DeployStatus = {
  Phase: DeployPhase | string
  Ready: boolean
  VPNCIDR?: string
  InternetCIDR?: string
  VPNConfig?: string
  Devices?: DeployDeviceStatus[]
  Access?: DeployAccess[]
}

/** Start a test deploy of one variant; resolves with the deploy id to poll. */
export function deployVariant(exerciseId: string, versionId: string, variantId: string): Promise<DeployResponse> {
  return apiPost<DeployResponse>(
    `${BASE}/${exerciseId}/versions/${versionId}/variants/${variantId}/deploy`,
    {}
  )
}

/** Poll a running deploy's status. */
export function deployStatus(group: string): Promise<DeployStatus> {
  return apiGet<DeployStatus>(`${BASE}/deploys/${encodeURIComponent(group)}`)
}

/** Tear a test deploy down. */
export function destroyDeploy(group: string): Promise<void> {
  return apiDelete<void>(`${BASE}/deploys/${encodeURIComponent(group)}`)
}
