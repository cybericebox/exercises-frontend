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
 *
 * A web device opens through a link: POST /api/exercises/deploys/:id/link
 * (openDeployLink) returns https://<device>-<code>.<base>/_auth?t=... for a ready lab.
 * The link is short-lived and single use, so it is fetched on every click; the lab proxy
 * turns it into its own cookie on the lab domain, which lasts until the deploy's lease ends.
 */
import { apiGet, apiPost, apiDelete } from "@/api/client"

const BASE = "/api/exercises"

export type DeployPhase = "Pending" | "Provisioning" | "Ready" | "Failed"

/** A task whose flag the author must find in the lab; the value never reaches the browser. */
export type DeployTask = { TaskID: string; Name: string }

export type DeployResponse = {
  DeployID: string
  Lab: string
  VPNClient?: string
  Tasks?: DeployTask[]
}

/** One of the caller's own active test deploys, as GET /exercises/deploys lists it. */
export type DeployListItem = {
  DeployID: string
  Lab: string
  ExerciseID: string
  VersionID: string
  VariantID: string
  CreatedAt: string
  /** When the lease ends. */
  ExpiresAt: string
  Tasks: DeployTask[]
  /** Tasks already checked correctly; kept with the deploy, so a reload keeps the progress. */
  SolvedTaskIDs?: string[]
}

/** The caller's active test deploys: of one exercise, or (no argument) of all of them. */
export function listDeploys(exerciseId?: string): Promise<DeployListItem[]> {
  return apiGet<DeployListItem[]>(exerciseId ? `${BASE}/deploys?exerciseID=${encodeURIComponent(exerciseId)}` : `${BASE}/deploys`)
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
  /** The author's VPN shook hands with this lab within the last three minutes. */
  VPNConnected?: boolean
  /** Time of that last handshake (ISO); absent when the VPN never connected. */
  VPNLastHandshake?: string
  SolvedTaskIDs?: string[]
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

export type DeployLink = { URL: string; ExpiresAt: string }

/** Get the one-click link that opens a web device of a ready test deploy. */
export function openDeployLink(group: string, device: string, port: number): Promise<DeployLink> {
  return apiPost<DeployLink>(`${BASE}/deploys/${encodeURIComponent(group)}/link`, { Device: device, Port: port })
}

/** Tear a test deploy down. */
export function destroyDeploy(group: string): Promise<void> {
  return apiDelete<void>(`${BASE}/deploys/${encodeURIComponent(group)}`)
}

/** Ask whether a flag the author found is the one injected for a task. */
export function checkDeployFlag(group: string, taskId: string, flag: string): Promise<{ Correct: boolean }> {
  return apiPost<{ Correct: boolean }>(`${BASE}/deploys/${encodeURIComponent(group)}/check`, { TaskID: taskId, Flag: flag })
}
