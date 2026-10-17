/**
 * linkedMirrorMute.ts — lets a writer of server-assigned ids pause the live linked-variant
 * mirror (useLinkedVariantSync) of one form. The daemon gives a linked variant the same ids as
 * its base, so id adoption needs no mirror pass; a pass mid-adoption would rebuild a linked
 * variant whose ids are only partly written and remount its open subtask form.
 */
const muted = new WeakSet<object>()

/** Runs `write` with the mirror of the form that owns `control` paused. */
export function withLinkedMirrorMuted(control: object, write: () => void): void {
  if (muted.has(control)) { write(); return }
  muted.add(control)
  try { write() } finally { muted.delete(control) }
}

export function isLinkedMirrorMuted(control: object): boolean {
  return muted.has(control)
}
