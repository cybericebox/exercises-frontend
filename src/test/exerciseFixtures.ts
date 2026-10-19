import type { ExerciseOwnership } from "@/api/exercises/catalog"

/** W4 ownership defaults for test fixtures: a plain catalog exercise, RBAC fallback. */
export const OWNERSHIP: ExerciseOwnership = {
  Scope: "catalog", OwnerEventID: null, OwnerEventName: "", OwnerEvent: null, AccessLevel: "all", AccessEventIDs: [], AccessEvents: [],
  OriginEventID: null, ForkedFrom: null, Infrastructure: false, ResourceHeavy: false, PendingProposalID: null, Permissions: null,
}

/** The list-only fields of a catalog row (author, average difficulty), empty. */
export const LIST_EXTRAS = { AuthorID: null, AuthorName: "", AvgDifficulty: null } as const satisfies Pick<import("@/api/exercises/catalog").ExerciseListItem, "AuthorID" | "AuthorName" | "AvgDifficulty">
