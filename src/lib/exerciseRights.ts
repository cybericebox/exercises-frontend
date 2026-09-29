/**
 * exerciseRights.ts — what the current user may do in the catalog app.
 *
 * Sources: GET /exercises/access (who the user is: admin, event memberships)
 * and the per-exercise `Permissions` computed by the server. When either is
 * missing (older API, tests) the RBAC permissions of /api/auth/me are used.
 */
import type { AccessEvent, ExerciseAccess } from "@/api/exercises/access"
import type { ExerciseOwnership, ExercisePermissions } from "@/api/exercises/catalog"

export type RbacCheck = (permission: string) => boolean

/** The app opens for admins and for anyone with at least one event membership. */
export function hasCatalogAccess(access: ExerciseAccess): boolean {
  return access.IsAdmin || access.Events.length > 0
}

/** Rights derived from RBAC only — used when /exercises/access is unavailable. */
export function accessFromRbac(can: RbacCheck): ExerciseAccess {
  return {
    IsAdmin: can("exercises.read"),
    CanCreateCatalog: can("exercises.write"),
    CanPublish: can("exercises.publish"),
    CanDelete: can("exercises.delete"),
    CanExport: can("exercises.export"),
    Events: [],
  }
}

export function writableEvents(access: ExerciseAccess): AccessEvent[] {
  return access.Events.filter((event) => event.CanWrite)
}

export function canCreateExercise(access: ExerciseAccess): boolean {
  return access.CanCreateCatalog || writableEvents(access).length > 0
}

/** Owner options for a new exercise: "" is the catalog (admins), otherwise an event ID. */
export type OwnerOption = { value: string; label: string; event: AccessEvent | null }

export function ownerOptions(access: ExerciseAccess, catalogLabel: string): OwnerOption[] {
  return [
    ...(access.CanCreateCatalog ? [{ value: "", label: catalogLabel, event: null }] : []),
    ...writableEvents(access).map((event) => ({ value: event.ID, label: event.Name || event.Tag, event })),
  ]
}

/**
 * Initial owner of a new exercise: the requested event when the user may write to
 * it; else the catalog for admins; else the only writable event. null = the user
 * must pick one.
 */
export function defaultOwner(access: ExerciseAccess, requestedEventId: string | null): string | null {
  const events = writableEvents(access)
  if (requestedEventId && events.some((event) => event.ID === requestedEventId)) return requestedEventId
  if (access.CanCreateCatalog) return ""
  return events.length === 1 ? events[0].ID : null
}

/** Whether exercises owned by this event may use lab infrastructure (unknown events → server decides). */
export function infrastructureAllowed(access: ExerciseAccess | null, ownerEventId: string | null): boolean {
  if (!ownerEventId || !access) return true
  const event = access.Events.find((candidate) => candidate.ID === ownerEventId)
  return event ? event.InfrastructureAllowed : true
}

/**
 * Non-admins read catalog exercises only through their published version
 * (no working copy, history or usage).
 */
export function isReadOnlyCatalogView(access: ExerciseAccess | null, exercise: Pick<ExerciseOwnership, "Scope">): boolean {
  return access !== null && !access.IsAdmin && exercise.Scope === "catalog"
}

export type EditorPermissions = {
  write: boolean
  publish: boolean
  delete: boolean
  export: boolean
  manageAccess: boolean
  propose: boolean
}

const NONE: EditorPermissions = { write: false, publish: false, delete: false, export: false, manageAccess: false, propose: false }

function fromServer(permissions: ExercisePermissions): EditorPermissions {
  return {
    write: permissions.CanEdit,
    publish: permissions.CanPublish,
    delete: permissions.CanDelete,
    export: permissions.CanExport,
    manageAccess: permissions.CanManageAccess,
    propose: permissions.CanPropose,
  }
}

/** Editor actions for a loaded exercise, or for a new one (exercise = null). */
export function editorPermissions(
  exercise: Pick<ExerciseOwnership, "Permissions" | "Scope"> | null,
  access: ExerciseAccess | null,
  can: RbacCheck,
): EditorPermissions {
  if (exercise && isReadOnlyCatalogView(access, exercise)) return NONE
  if (exercise?.Permissions) return fromServer(exercise.Permissions)
  if (!exercise && access) {
    return { ...NONE, write: canCreateExercise(access) }
  }
  return {
    write: can("exercises.write"),
    publish: can("exercises.publish"),
    delete: can("exercises.delete"),
    export: can("exercises.export"),
    manageAccess: can("exercises.write") && exercise?.Scope !== "event",
    propose: false,
  }
}
