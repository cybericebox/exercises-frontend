import type { ExerciseOwnership } from "@/api/exercises/catalog"

/** W4 ownership defaults for test fixtures: a plain catalog exercise, RBAC fallback. */
export const OWNERSHIP: ExerciseOwnership = {
  Scope: "catalog", OwnerEventID: null, OwnerEventName: "", AccessLevel: "all", AccessEventIDs: [],
  OriginEventID: null, ForkedFrom: null, Infrastructure: false, PendingProposalID: null, Permissions: null,
}
