/**
 * conditionSpec.ts — the eight observation kinds of a state check, exactly the keys of the schema 1.0 (section 4.2):
 * which fields each kind has, how each is edited, and which ones only make sense for http / https. Texts live in
 * `messages/editor/b.*.json` under `ed.b.cond.<kind>.<stem>` (`.help` = the first help sentence, `.def` = default or
 * empty meaning, `.ph` = placeholder example, `.yes` / `.no` / `.none` = options of a yes-no field).
 */
import type { ObservationKind } from "@/api/exercises/model"
import type { ConditionFormValues } from "@/lib/editor/schemas/task"

export type FieldKind =
  /** a single-line text; `number` is typed text checked as a number */
  | "text" | "number"
  /** a fixed list of values (`options`) */
  | "select"
  /** true / false, shown as two options; an absent value shows the first (the documented default) */
  | "yn"
  /** true / false / not checked */
  | "tri"
  /** names separated by commas */
  | "list"

export type CondFieldSpec = {
  /** Key in the form object of the kind (`Path`). */
  key: string
  /** Message stem (`path`). */
  stem: string
  kind: FieldKind
  mono?: boolean
  required?: boolean
  /** Expected values may insert `{{task.<key>}}` and `{{var.<name>}}` (the token picker). */
  picker?: boolean
  /** Values of a `select`. */
  options?: string[]
  /** Shown only for http and https requests. */
  httpOnly?: boolean
  /** A placeholder message exists (`.ph`). */
  ph?: boolean
  /** A default / empty-meaning line exists (`.def`). */
  def?: boolean
}

export type KindSpec = {
  kind: ObservationKind
  /** Message stem of the kind (`kernel_param`). */
  stem: string
  /** The kind runs code of the author in the device. */
  runsCode?: boolean
  fields: CondFieldSpec[]
}

const f = (key: string, stem: string, kind: FieldKind, extra: Partial<CondFieldSpec> = {}): CondFieldSpec => ({ key, stem, kind, ...extra })

export const KIND_SPECS: KindSpec[] = [
  // The file kind is edited with optional expectations (chips) in FileBody; its fields are listed for the tests and messages.
  { kind: "file", stem: "file", fields: [
    f("Path", "path", "text", { mono: true, required: true, ph: true, def: true }),
    f("Exists", "exists", "yn", { def: true }),
    f("Type", "type", "select", { options: ["file", "directory", "symlink"], def: true }),
    f("Contains", "contains", "text", { mono: true, picker: true, def: true }),
    f("Matches", "matches", "text", { mono: true, picker: true, def: true }),
    f("Checksum", "checksum", "text", { mono: true, picker: true, ph: true, def: true }),
    f("Mode", "mode", "text", { mono: true, ph: true, def: true }),
    f("Owner", "owner", "text", { mono: true, picker: true, def: true }),
    f("Group", "group", "text", { mono: true, picker: true, def: true }),
  ] },
  { kind: "directory", stem: "directory", fields: [
    f("Path", "path", "text", { mono: true, required: true, ph: true, def: true }),
    f("Exists", "exists", "yn", { def: true }),
    f("Mode", "mode", "text", { mono: true, ph: true, def: true }),
    f("Owner", "owner", "text", { mono: true, def: true }),
    f("Group", "group", "text", { mono: true, def: true }),
    f("HasEntries", "has_entries", "list", { mono: true, ph: true, def: true }),
    f("LacksEntries", "lacks_entries", "list", { mono: true, ph: true, def: true }),
  ] },
  { kind: "process", stem: "process", fields: [
    f("Name", "name", "text", { mono: true, ph: true, def: true }),
    f("Matches", "matches", "text", { mono: true, ph: true, def: true }),
    f("User", "user", "text", { mono: true, ph: true, def: true }),
    f("Running", "running", "yn", { def: true }),
  ] },
  { kind: "port", stem: "port", fields: [
    f("Port", "port", "number", { mono: true, required: true, ph: true, def: true }),
    f("Protocol", "protocol", "select", { options: ["tcp", "udp"], def: true }),
    f("Listening", "listening", "yn", { def: true }),
    f("Address", "address", "text", { mono: true, ph: true, def: true }),
    f("Process", "process", "text", { mono: true, ph: true, def: true }),
  ] },
  { kind: "kernelParam", stem: "kernel_param", fields: [
    f("Name", "name", "text", { mono: true, required: true, ph: true }),
    f("Equals", "equals", "text", { mono: true, picker: true, ph: true, def: true }),
    f("Matches", "matches", "text", { mono: true, picker: true, ph: true, def: true }),
  ] },
  { kind: "request", stem: "request", fields: [
    f("Protocol", "protocol", "select", { options: ["tcp", "http", "https"], required: true }),
    f("Host", "host", "text", { mono: true, ph: true, def: true }),
    f("Port", "port", "number", { mono: true, required: true, ph: true, def: true }),
    f("Method", "method", "select", { options: ["GET", "HEAD"], httpOnly: true, def: true }),
    f("Path", "path", "text", { mono: true, httpOnly: true, ph: true, def: true }),
    f("Status", "status", "number", { mono: true, httpOnly: true, ph: true, def: true }),
    f("BodyContains", "body_contains", "text", { mono: true, picker: true, httpOnly: true, def: true }),
    f("BodyMatches", "body_matches", "text", { mono: true, picker: true, httpOnly: true, def: true }),
  ] },
  { kind: "permission", stem: "permission", fields: [
    f("User", "user", "text", { mono: true, required: true, ph: true }),
    f("Path", "path", "text", { mono: true, required: true, ph: true, def: true }),
    f("Read", "read", "tri", { def: true }),
    f("Write", "write", "tri", { def: true }),
    f("Execute", "execute", "tri", { def: true }),
  ] },
  { kind: "custom", stem: "custom", runsCode: true, fields: [
    f("Run", "run", "text", { mono: true, required: true, ph: true }),
    f("Interpreter", "interpreter", "text", { mono: true, ph: true, def: true }),
    f("User", "user", "text", { mono: true, ph: true, def: true }),
    f("OutputContains", "output_contains", "text", { mono: true, picker: true }),
    f("OutputMatches", "output_matches", "text", { mono: true, picker: true }),
  ] },
]

export const KIND_SPEC: Record<ObservationKind, KindSpec> = Object.fromEntries(KIND_SPECS.map((spec) => [spec.kind, spec])) as Record<ObservationKind, KindSpec>

/** The sub-object of the condition that holds a kind's fields. */
export function kindObject(condition: ConditionFormValues): Record<string, unknown> {
  const key = { file: "File", directory: "Directory", process: "Process", port: "Port", kernelParam: "KernelParam", request: "Request", permission: "Permission", custom: "Custom" }[condition.Kind] as keyof ConditionFormValues
  return condition[key] as unknown as Record<string, unknown>
}

/** Fields of the file kind that are optional expectations (added as chips, removed with a cross). */
export const FILE_OPTIONAL = ["Exists", "Type", "Contains", "Matches", "Checksum", "Mode", "Owner", "Group"] as const
/** Output rules of a command (optional, added as chips). */
export const CUSTOM_OPTIONAL = ["OutputContains", "OutputMatches"] as const

export type TriValue = boolean | null
export const triToChoice = (value: TriValue): "" | "yes" | "no" => (value === null ? "" : value ? "yes" : "no")
export const choiceToTri = (choice: string): TriValue => (choice === "" ? null : choice === "yes")

/** A hint that the user of a command is higher than `nobody` (the command may give rights to the participant). */
export function customRunsWithRights(user: string): boolean {
  const value = user.trim()
  return value !== "" && value !== "nobody"
}
