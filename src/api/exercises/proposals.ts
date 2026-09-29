/**
 * proposals.ts — event exercise → catalog proposals.
 *
 * POST /api/exercises/:id/proposals {Note} (managers of the owner event);
 * GET /api/exercises/proposals?status= (admins);
 * POST /api/exercises/proposals/:id/approve {Name?, AccessLevel, EventIDs, Note};
 * POST /api/exercises/proposals/:id/reject {Note}.
 */
import { apiGet, apiPost } from "@/api/client"
import type { AccessLevel } from "./catalog"

const BASE = "/api/exercises"

export type ProposalStatus = "pending" | "approved" | "rejected"

export type Proposal = {
  ID: string
  ExerciseID: string
  ExerciseName: string
  EventID: string
  EventName: string
  Status: ProposalStatus
  Note: string
  ProposedBy: string | null
  ProposedByName: string
  ProposedAt: string
  DecidedAt: string | null
  DecisionNote: string
  CatalogExerciseID: string | null
}

type RawProposal = Partial<Proposal> & { ID: string }

export function normalizeProposal(raw: RawProposal): Proposal {
  return {
    ID: raw.ID,
    ExerciseID: raw.ExerciseID ?? "",
    ExerciseName: raw.ExerciseName ?? "",
    EventID: raw.EventID ?? "",
    EventName: raw.EventName ?? "",
    Status: raw.Status ?? "pending",
    Note: raw.Note ?? "",
    ProposedBy: raw.ProposedBy ?? null,
    ProposedByName: raw.ProposedByName ?? "",
    ProposedAt: raw.ProposedAt ?? "",
    DecidedAt: raw.DecidedAt ?? null,
    DecisionNote: raw.DecisionNote ?? "",
    CatalogExerciseID: raw.CatalogExerciseID ?? null,
  }
}

/** POST /api/exercises/:id/proposals */
export async function proposeExercise(exerciseId: string, note: string): Promise<Proposal> {
  return normalizeProposal(await apiPost<RawProposal>(`${BASE}/${exerciseId}/proposals`, { Note: note.trim() }))
}

/** GET /api/exercises/proposals?status= */
export async function listProposals(status: ProposalStatus = "pending"): Promise<Proposal[]> {
  const raw = await apiGet<RawProposal[] | null>(`${BASE}/proposals?${new URLSearchParams({ status })}`)
  return (raw ?? []).map(normalizeProposal)
}

export type ApproveInput = {
  Name?: string
  AccessLevel: Exclude<AccessLevel, "">
  EventIDs: string[]
  Note: string
}

/** POST /api/exercises/proposals/:id/approve — creates a new catalog exercise (CatalogExerciseID). */
export async function approveProposal(proposalId: string, input: ApproveInput): Promise<Proposal> {
  const name = input.Name?.trim()
  const body = {
    ...(name ? { Name: name } : {}),
    AccessLevel: input.AccessLevel,
    EventIDs: input.AccessLevel === "selected" ? input.EventIDs : [],
    Note: input.Note.trim(),
  }
  return normalizeProposal(await apiPost<RawProposal>(`${BASE}/proposals/${proposalId}/approve`, body))
}

/** POST /api/exercises/proposals/:id/reject */
export async function rejectProposal(proposalId: string, note: string): Promise<Proposal> {
  return normalizeProposal(await apiPost<RawProposal>(`${BASE}/proposals/${proposalId}/reject`, { Note: note.trim() }))
}
