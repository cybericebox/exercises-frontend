import type { ArchiveCommitInput } from "@/api/exercises/archiveImport"

/** Recovery metadata only: never passwords, archive bytes, flags, or form values. */
export type ImportReplacementMarker = { actorID: string; exerciseID: string; attemptID: string; jobID?: string; state: "unknown" | "running" | "done"; plan: Omit<ArchiveCommitInput, "Password"> }
export function sameImportPlan(marker: ImportReplacementMarker, input: ArchiveCommitInput) {
  const plan = { ...input }
  Reflect.deleteProperty(plan, "Password")
  return JSON.stringify(marker.plan) === JSON.stringify(plan)
}
const key = (actorID: string, exerciseID: string) => `exercises.importReplacement:${actorID}:${exerciseID}`
export function readImportReplacement(actorID: string, exerciseID: string): ImportReplacementMarker | null {
  try {
    const value = JSON.parse(localStorage.getItem(key(actorID, exerciseID)) ?? "null") as ImportReplacementMarker | null
    return value?.actorID === actorID && value.exerciseID === exerciseID && value.attemptID && value.plan ? value : null
  } catch { return null }
}
export function writeImportReplacement(marker: ImportReplacementMarker) {
  try {
    const serialized = JSON.stringify(marker)
    localStorage.setItem(key(marker.actorID, marker.exerciseID), serialized)
    if (localStorage.getItem(key(marker.actorID, marker.exerciseID)) !== serialized) return false
    window.dispatchEvent(new Event("exercises:import-replacement"))
    return true
  } catch { return false }
}
export function clearImportReplacement(actorID: string, exerciseID: string) {
  try { localStorage.removeItem(key(actorID, exerciseID)); window.dispatchEvent(new Event("exercises:import-replacement")) } catch { /* best effort */ }
}
export function replacementMarker(actorID: string, exerciseID: string, input: ArchiveCommitInput): ImportReplacementMarker {
  const plan = { ...input }
  Reflect.deleteProperty(plan, "Password")
  return { actorID, exerciseID, attemptID: crypto.randomUUID(), state: "unknown", plan }
}

export const IMPORT_REPLACEMENT_EVENT = "exercises:import-replacement"
export function recordImportPlan(actorID: string, input: ArchiveCommitInput, jobID?: string) {
  const ids = new Set(input.Targets.filter(target => target.Mode === "update").map(target => target.ExerciseID).filter((id): id is string => Boolean(id)))
  if (!input.FixedExerciseID) ids.add("__catalog__")
  const previous = new Map([...ids].map(exerciseID => [exerciseID, readImportReplacement(actorID, exerciseID)]))
  for (const exerciseID of ids) {
    const existing = previous.get(exerciseID)
    if (!writeImportReplacement({ ...(existing && sameImportPlan(existing, input) ? existing : replacementMarker(actorID, exerciseID, input)), ...(jobID ? { jobID, state: "running" } : {}) })) {
      // Nothing has been dispatched. Roll back a partial local marker write without
      // deleting another operation's prior recovery metadata.
      for (const [id, marker] of previous) { if (marker) writeImportReplacement(marker); else clearImportReplacement(actorID, id) }
      return false
    }
  }
  return true
}
export function settleImportPlan(actorID: string, input: ArchiveCommitInput, succeeded: boolean) {
  for (const target of input.Targets) {
    if (target.Mode !== "update" || !target.ExerciseID) continue
    const marker = readImportReplacement(actorID, target.ExerciseID)
    if (!marker || !sameImportPlan(marker, input)) continue
    if (succeeded) writeImportReplacement({ ...marker, state: "done" })
    else clearImportReplacement(actorID, target.ExerciseID)
  }
  const catalog = readImportReplacement(actorID, "__catalog__")
  if (catalog && sameImportPlan(catalog, input)) {
    if (succeeded && catalog.jobID) writeImportReplacement({ ...catalog, state: "done" })
    else clearImportReplacement(actorID, "__catalog__")
  }
}

// Same-browser editor generations, including an orphan still draining its unmount save.
// This is not a lock for other tabs/devices. Server revision validation remains authoritative.
type ImportEditorFence = { prepare: () => Promise<boolean>; cancel: () => void }
const editors = new Map<string, Set<ImportEditorFence>>()
export function registerImportEditor(actorID: string, exerciseID: string, editor: ImportEditorFence) {
  const id = key(actorID, exerciseID)
  const registered = editors.get(id) ?? new Set<ImportEditorFence>()
  registered.add(editor); editors.set(id, registered)
  return () => { registered.delete(editor); if (!registered.size) editors.delete(id) }
}
export function hasImportEditors(actorID: string, exerciseIDs: string[]) {
  return exerciseIDs.some(exerciseID => Boolean(editors.get(key(actorID, exerciseID))?.size))
}
export async function prepareImportEditors(actorID: string, exerciseIDs: string[]) {
  for (const exerciseID of exerciseIDs) for (const editor of editors.get(key(actorID, exerciseID)) ?? []) {
    if (!await editor.prepare()) { releaseImportEditors(actorID, exerciseIDs); return false }
  }
  return true
}
export function releaseImportEditors(actorID: string, exerciseIDs: string[]) {
  for (const exerciseID of exerciseIDs) for (const editor of editors.get(key(actorID, exerciseID)) ?? []) editor.cancel()
}
