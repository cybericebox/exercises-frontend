/**
 * variantWeights.ts — the issue weight of a variant as the form keeps it (the daemon's rule: absent or 0 reads as 1).
 */

/** The issue weight as the form keeps it: a whole number ≥ 1; absent, 0 or garbage reads as 1. */
export function normalizeWeight(raw: unknown): number {
  return typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : 1
}
