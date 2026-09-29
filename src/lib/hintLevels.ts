/** How much a hint helps; the price is set per event, not in the catalog. */
export const HINT_LEVELS = ["nudge", "direction", "steps", "near_solution"] as const
export type HintLevel = (typeof HINT_LEVELS)[number]
