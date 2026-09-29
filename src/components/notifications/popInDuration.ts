/** Every new inbox message pops up. Existing out-of-range values are bounded. */
export function popInDuration(value: number | null | undefined): number {
  return value == null ? 5000 : Math.min(10000, Math.max(3000, value))
}
