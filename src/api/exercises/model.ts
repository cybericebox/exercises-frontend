/**
 * model.ts — wire types of the exercise document cib-exercise/1.0 that are new or changed against the old editor:
 * task checks (answer / state with eight observations), device access and bootstrap, variables of the infrastructure.
 *
 * Source of truth: daemon handler/exercise/dto.go + observation_dto.go and docs/exercise-http-api-1.0.md
 * (PascalCase; optional booleans of an observation are tri-state pointers: absent = the documented default).
 * Used by versions.ts (the DTOs of a draft) and by the editor form model (lib/editor/schemas).
 */

// ── Task check ────────────────────────────────────────────────────────────────

export type AnswerType = "flag" | "text"

/** The participant types a value. flag: ICE{…} or template:ICE{…}; none = a random flag per instance. */
export type AnswerCheckDTO = {
  Type: AnswerType
  Values?: string[]
  /** Shown inside the answer field; at most 100 characters. Both types. */
  InputHint?: string
  /** text only. */
  IgnoreCase?: boolean
  /** text only; absent = on. */
  Trim?: boolean | null
}

export type StateMode = "once" | "continuous"

export const OBSERVATION_KINDS = ["file", "directory", "process", "port", "kernelParam", "request", "permission", "custom"] as const
export type ObservationKind = (typeof OBSERVATION_KINDS)[number]

/** Wire key of an observation inside a condition. */
export const OBSERVATION_WIRE_KEY = {
  file: "File", directory: "Directory", process: "Process", port: "Port", kernelParam: "KernelParam", request: "Request", permission: "Permission", custom: "Custom",
} as const satisfies Record<ObservationKind, string>

export type FileObservationDTO = {
  Path: string
  /** Default true; false stands alone. */
  Exists?: boolean
  Type?: "" | "file" | "directory" | "symlink"
  Contains?: string
  Matches?: string
  Checksum?: string
  Mode?: string
  Owner?: string
  Group?: string
}
export type DirectoryObservationDTO = {
  Path: string
  Exists?: boolean
  Mode?: string
  Owner?: string
  Group?: string
  HasEntries?: string[]
  LacksEntries?: string[]
}
export type ProcessObservationDTO = { Name?: string; Matches?: string; User?: string; Running?: boolean }
export type PortObservationDTO = { Port: number; Protocol?: "" | "tcp" | "udp"; Listening?: boolean; Address?: string; Process?: string }
export type KernelParamObservationDTO = { Name: string; Equals?: string; Matches?: string }
export type RequestProtocol = "tcp" | "http" | "https"
export type RequestObservationDTO = {
  Protocol: RequestProtocol
  Host?: string
  Port: number
  Method?: "" | "GET" | "HEAD"
  Path?: string
  Status?: number
  BodyContains?: string
  BodyMatches?: string
}
export type PermissionObservationDTO = { User: string; Path: string; Read?: boolean; Write?: boolean; Execute?: boolean }
/** User empty = nobody (applied by the laboratory, never stored). Any other user is the author's explicit choice. */
export type CustomObservationDTO = { Run: string; Interpreter?: string; User?: string; OutputContains?: string; OutputMatches?: string }

/** One condition: a node device of the variant and exactly one observation. */
export type ConditionDTO = {
  DeviceID: string
  /** Go duration, 1s to 1m. */
  Timeout?: string
  File?: FileObservationDTO
  Directory?: DirectoryObservationDTO
  Process?: ProcessObservationDTO
  Port?: PortObservationDTO
  KernelParam?: KernelParamObservationDTO
  Request?: RequestObservationDTO
  Permission?: PermissionObservationDTO
  Custom?: CustomObservationDTO
}

/** The laboratory checks devices (Academy only: a state task never joins an event, error 23513). */
export type StateCheckDTO = {
  Mode?: StateMode
  /** Go duration, 5s to 24h; "" or "0" = no schedule. */
  Interval?: string
  Manual?: boolean
  Conditions: ConditionDTO[]
}

/** Exactly one of Answer and State (a draft may have neither). */
export type CheckDTO = { Answer?: AnswerCheckDTO; State?: StateCheckDTO }

export const TASK_KEY_RE = /^[a-z][a-z0-9_]{0,31}$/
export const MAX_REQUIRES = 32
export const MAX_CONDITIONS = 20
export const MAX_ANSWER_VALUES = 100
export const MAX_ANSWER_VALUE_LEN = 256
export const MAX_INPUT_HINT = 100

// ── Device access ─────────────────────────────────────────────────────────────

export type AccessKind = "http" | "terminal" | "vnc" | "rdp"
export const ACCESS_KINDS: readonly AccessKind[] = ["http", "terminal", "vnc", "rdp"]
/** vnc and rdp are accepted and stored, but nothing serves them yet. */
export const ACCESS_KINDS_SERVED: readonly AccessKind[] = ["http", "terminal"]
export type AccessProtocol = "http" | "https"

export type AccessDTO = {
  Kind: AccessKind
  /** http, vnc, rdp: 1-65535 required. */
  Port?: number
  /** http: empty = http. */
  Protocol?: AccessProtocol
  /** terminal: absolute path, default /bin/sh. */
  Command?: string
  /** terminal: default the user of the image. */
  User?: string
  /** terminal: upload to and download from the device through the console page (default false; not on profile vm). */
  Files?: boolean
}

// ── Device runtime ────────────────────────────────────────────────────────────

export type DeviceProfile = "container" | "microvm" | "vm"
export type DeviceSystem = "linux" | "windows"
export type DeviceHardware = "fast" | "compatible"

export type EnvVarDTO = {
  Name: string
  Value?: string
  Secret: boolean
  /** Response-only. */
  HasValue?: boolean
  /**
   * Response-only, secrets with a stored value: 1, 2, … — equal numbers mean equal values WITHIN ONE response
   * (copied, linked, kept or imported secrets; a value typed and saved has a group of its own). Meaningless across
   * responses: never persisted, never compared between reads.
   */
  ValueGroup?: number
}

export type BootstrapFileDTO = {
  Path: string
  /** Exactly one of Content (up to 64 KiB) and Source (an uploaded file, like an attachment). */
  Content?: string
  Source?: { FileID: string; Name: string; ContentHash?: string }
  Owner?: string
  Group?: string
  Mode?: string
}

/** What happens to a clean device before its service starts; Env are the variables of the service process. */
export type BootstrapDTO = {
  /** Go duration, 1s to 10m. */
  Timeout?: string
  Env?: EnvVarDTO[]
  Files?: BootstrapFileDTO[]
  Script?: string
  /** Only with Script. */
  Interpreter?: string
}

export const MAX_BOOTSTRAP_ENV = 64
export const MAX_BOOTSTRAP_FILES = 32
export const MAX_ACCESS_ENTRIES = 4
export const MAX_DEVICE_COMMAND = 32
export const MAX_DEVICE_ARGS = 64
/** Daemon limits of a bootstrap (MaxBootstrapFileBytes / MaxBootstrapDeviceBytes), checked again by the server. */
export const MAX_BOOTSTRAP_FILE_BYTES = 256 * 1024
export const MAX_BOOTSTRAP_DEVICE_BYTES = 512 * 1024
export const MAX_BOOTSTRAP_CONTENT_BYTES = 64 * 1024
export const MAX_BOOTSTRAP_SCRIPT_BYTES = 64 * 1024

// ── Infrastructure variables ──────────────────────────────────────────────────

/** Exactly one of Value (up to 1024 bytes) and Template. Name as a task key. */
export type VariableDTO = { Name: string; Value?: string; Template?: string }
export const MAX_VARIABLES = 64
export const MAX_VARIABLE_VALUE_BYTES = 1024

// ── Substitutions ─────────────────────────────────────────────────────────────

/** `{{task.<Key>}}` and `{{var.<Name>}}` work in Bootstrap Env values, File contents, Script and condition expectations. */
export const taskRef = (key: string) => `{{task.${key}}}`
export const varRef = (name: string) => `{{var.${name}}}`
export const REF_RE = /\{\{(task|var)\.([A-Za-z0-9_]+)\}\}/g
