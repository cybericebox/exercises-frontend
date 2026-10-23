/**
 * variantWeights.ts — the daemon's issue rule for variant weights, mirrored for the editor.
 * The next solution gets the variant issued least relative to its weight; a tie goes to the lowest
 * number. Deterministic: weights 2, 1 give 1, 2, 1, 1, 2, 1 …
 */

/** The issue weight as the form keeps it: a whole number ≥ 1; absent, 0 or garbage reads as 1. */
export function normalizeWeight(raw: unknown): number {
  return typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : 1
}

/** Variant numbers (1-based) of the first `count` issues for these weights (a weight below 1 counts as 1). */
export function issueOrder(weights: number[], count = 14): number[] {
  if (weights.length === 0) return []
  const weight = weights.map((value) => (Number.isFinite(value) && value >= 1 ? value : 1))
  const issued = weight.map(() => 0)
  const order: number[] = []
  for (let step = 0; step < count; step += 1) {
    let best = 0
    // issued[i] / weight[i] < issued[best] / weight[best], without floating point.
    for (let index = 1; index < weight.length; index += 1) {
      if (issued[index] * weight[best] < issued[best] * weight[index]) best = index
    }
    issued[best] += 1
    order.push(best + 1)
  }
  return order
}

export function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a
}
