/**
 * task.ts — the TASK half of the editor form model (owner: package B, seeded by the foundation).
 *
 * Form types, zod schemas, empty-value factories and form <-> wire converters for a task: identity, check (answer or
 * state with eight observations), requires, attachments, placeholders and hints. `lib/exerciseSchemas.ts` composes
 * this with the infrastructure half (`./infra`) and re-exports both, so existing imports keep working.
 *
 * The messages of the validation live in `messages/editor/b.*.json` (prefix `ed.b.val.`); the mockup's wording
 * (parts/25-yaml-validate.js) is reused verbatim.
 */
import { hasSubstitution } from "../refs"
import { z } from "zod"
import { t } from "@/i18n/t"
import { parseFlagCandidate, flagCandidateErrorKey, TEMPLATE_PREFIX } from "@/lib/flagPattern"
import { LINK_SCHEMES, isValidLinkPath, isValidLinkPort } from "@/lib/placeholderLink"
import { hintTextHasContent } from "@/lib/hintText"
import { MAX_HINTS, MAX_HINT_TEXT } from "@/lib/hintLimits"
import { HINT_LEVELS } from "@/lib/hintLevels"
import {
  MAX_ANSWER_VALUES, MAX_ANSWER_VALUE_LEN, MAX_CONDITIONS, MAX_INPUT_HINT, MAX_REQUIRES, OBSERVATION_KINDS, OBSERVATION_WIRE_KEY, TASK_KEY_RE,
  type AnswerType, type CheckDTO, type ConditionDTO, type ObservationKind, type RequestProtocol, type StateMode,
} from "@/api/exercises/model"
import type { NormalizedTask, PlaceholderAccess, PlaceholderDTO, PlaceholderKind, TaskDTO } from "@/api/exercises/versions"

// ── Form types ────────────────────────────────────────────────────────────────

/** Tri-state of an optional boolean of an observation: null = absent (the documented default applies). */
export type Tri = boolean | null

export type AnswerFormValues = {
  Type: AnswerType
  Values: string[]
  InputHint: string
  /** text only */
  IgnoreCase: boolean
  /** text only; the wire sends Trim only when it is off (absent = on). */
  Trim: boolean
}

export type FileObservationForm = { Path: string; Exists: Tri; Type: "" | "file" | "directory" | "symlink"; Contains: string; Matches: string; Checksum: string; Mode: string; Owner: string; Group: string }
export type DirectoryObservationForm = { Path: string; Exists: Tri; Mode: string; Owner: string; Group: string; HasEntries: string[]; LacksEntries: string[] }
export type ProcessObservationForm = { Name: string; Matches: string; User: string; Running: Tri }
/** Port and Status are typed text: "" = not set. */
export type PortObservationForm = { Port: string; Protocol: "" | "tcp" | "udp"; Listening: Tri; Address: string; Process: string }
export type KernelParamObservationForm = { Name: string; Equals: string; Matches: string }
export type RequestObservationForm = { Protocol: RequestProtocol; Host: string; Port: string; Method: "" | "GET" | "HEAD"; Path: string; Status: string; BodyContains: string; BodyMatches: string }
export type PermissionObservationForm = { User: string; Path: string; Read: Tri; Write: Tri; Execute: Tri }
export type CustomObservationForm = { Run: string; Interpreter: string; User: string; OutputContains: string; OutputMatches: string }

/**
 * One condition of a state check. All eight observations stay in the form so that switching the kind does not lose what
 * was typed; only the chosen `Kind` is sent.
 */
export type ConditionFormValues = {
  DeviceID: string
  Timeout: string
  Kind: ObservationKind
  File: FileObservationForm
  Directory: DirectoryObservationForm
  Process: ProcessObservationForm
  Port: PortObservationForm
  KernelParam: KernelParamObservationForm
  Request: RequestObservationForm
  Permission: PermissionObservationForm
  Custom: CustomObservationForm
}

export type StateFormValues = { Mode: StateMode; Interval: string; Manual: boolean; Conditions: ConditionFormValues[] }

export type CheckKind = "none" | "answer" | "state"
/** Both halves stay in the form (switching the kind keeps what was typed); `Kind` says which one is saved. */
export type CheckFormValues = { Kind: CheckKind; Answer: AnswerFormValues; State: StateFormValues }

export type PlaceholderFormValues = {
  Key: string
  Kind: PlaceholderKind
  IPReference: string
  /** gateway.subnet, and ip with IPReference "gateway": the name of the gateway ("" = not chosen yet). */
  Gateway: string
  Octets1to3: string
  LastOctet: number
  ShowMask: boolean
  DeviceName: string
  /** external.link: which access entry of the device the link points to. */
  Access?: PlaceholderAccess
  /** IP link form. PortText is the typed port: "" = the scheme default. */
  AsLink?: boolean
  Scheme?: string
  PortText?: string
  Path?: string
}

export type TaskFormValues = Omit<NormalizedTask, "Placeholders" | "Check"> & { Placeholders: PlaceholderFormValues[]; Check: CheckFormValues }

// ── Regexes and helpers ───────────────────────────────────────────────────────

const CONTROL_RE = /\p{Cc}/u
const USER_RE = /^([a-z_][a-z0-9_-]{0,31}|\d+)$/
const MODE_RE = /^[0-7]{3,4}$/
const CHECKSUM_RE = /^[0-9a-fA-F]{64}$/
const DURATION_RE = /^(\d+(\.\d+)?(ns|us|µs|ms|s|m|h))+$/

/** Go duration to seconds; null when it does not parse. */
export function durationSeconds(value: string): number | null {
  const text = value.trim()
  if (!DURATION_RE.test(text)) return null
  const unit: Record<string, number> = { ns: 1e-9, us: 1e-6, "µs": 1e-6, ms: 1e-3, s: 1, m: 60, h: 3600 }
  let total = 0
  for (const match of text.matchAll(/(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h)/g)) total += Number(match[1]) * unit[match[2]]
  return total
}

/** A substitution `{{task.<key>}}` or `{{var.<name>}}` in a text key; a text with one is not checked as a literal. */
const hasRef = (value: string) => value.includes("{{")


// ── Schemas ───────────────────────────────────────────────────────────────────

const placeholderSchema = z
  .object({
    Key: z.string().min(1),
    Kind: z.enum(["gateway.subnet", "ip", "external.link"]),
    IPReference: z.string(),
    Gateway: z.string(),
    Octets1to3: z.string(),
    LastOctet: z.number().int().min(0, t("admin.ex.val.lastOctet")).max(255, t("admin.ex.val.lastOctet")),
    ShowMask: z.boolean(),
    DeviceName: z.string(),
    Access: z.enum(["http", "terminal", "vnc", "rdp"]).optional(),
    AsLink: z.boolean().optional(),
    Scheme: z.string().optional(),
    PortText: z.string().optional(),
    Path: z.string().optional(),
  })
  .superRefine((p, ctx) => {
    if (p.Kind === "ip" && p.AsLink) {
      if (!(LINK_SCHEMES as readonly string[]).includes(p.Scheme ?? "")) {
        ctx.addIssue({ code: "custom", path: ["Scheme"], message: t("admin.ex.val.placeholderScheme") })
      }
      if (!isValidLinkPort(p.PortText ?? "")) {
        ctx.addIssue({ code: "custom", path: ["PortText"], message: t("admin.ex.val.placeholderPort") })
      }
      if (!isValidLinkPath(p.Path ?? "")) {
        ctx.addIssue({ code: "custom", path: ["Path"], message: t("admin.ex.val.placeholderPath") })
      }
      if (p.ShowMask) {
        ctx.addIssue({ code: "custom", path: ["ShowMask"], message: t("admin.ex.val.placeholderLinkMask") })
      }
    }
    if (p.Kind === "ip" && !["gateway", "static"].includes(p.IPReference)) {
      ctx.addIssue({ code: "custom", path: ["IPReference"], message: t("admin.ex.val.placeholderIPRef") })
    }
    if ((p.Kind === "gateway.subnet" || (p.Kind === "ip" && p.IPReference === "gateway")) && p.Gateway === "") {
      ctx.addIssue({ code: "custom", path: ["Gateway"], message: t("ed.b.val.placeholderGateway") })
    }
    if (p.Kind === "external.link" && p.DeviceName === "") {
      ctx.addIssue({ code: "custom", path: ["DeviceName"], message: t("admin.ex.val.placeholderDevice") })
    }
  })

// Text may stay empty while a draft autosaves; publish requires it (the draft refinement in exerciseSchemas.ts,
// mirrored by the server's 20951).
const hintSchema = z.object({
  ID: z.string(),
  Text: z.string().max(MAX_HINT_TEXT, t("exercises.hints.val.text")),
  Level: z.enum(HINT_LEVELS, { error: t("exercises.hints.val.level") }),
})

/** Message for an answer value, or "" when valid. `type` text: free text; flag: ICE{…} or template:ICE{…}. */
export function answerValueError(type: AnswerType, raw: string): string {
  if (type === "flag") {
    try { parseFlagCandidate(raw) } catch (error) { return t(flagCandidateErrorKey(error)) }
    return ""
  }
  if (raw.startsWith(TEMPLATE_PREFIX)) return raw.length > TEMPLATE_PREFIX.length ? "" : t("ed.b.val.textTemplateEmpty")
  if (!raw.trim()) return t("ed.b.val.answerRequired")
  if (raw.length > MAX_ANSWER_VALUE_LEN) return t("ed.b.val.answerTooLong", { max: MAX_ANSWER_VALUE_LEN })
  if (CONTROL_RE.test(raw)) return t("ed.b.val.answerControl")
  return ""
}

const answerSchema = z.object({
  Type: z.enum(["flag", "text"]),
  Values: z.array(z.string()),
  InputHint: z.string(),
  IgnoreCase: z.boolean(),
  Trim: z.boolean(),
}).superRefine((answer, ctx) => {
  if (answer.Values.length > MAX_ANSWER_VALUES) ctx.addIssue({ code: "custom", path: ["Values"], message: t("ed.b.val.answerMax", { max: MAX_ANSWER_VALUES }) })
  const seen = new Set<string>()
  answer.Values.forEach((value, index) => {
    const message = answerValueError(answer.Type, value)
    if (message) ctx.addIssue({ code: "custom", path: ["Values", index], message })
    if (seen.has(value)) ctx.addIssue({ code: "custom", path: ["Values", index], message: t("admin.ex.val.flagDuplicate") })
    seen.add(value)
  })
  if (answer.InputHint.length > MAX_INPUT_HINT || CONTROL_RE.test(answer.InputHint)) {
    ctx.addIssue({ code: "custom", path: ["InputHint"], message: t("ed.b.val.inputHint", { max: MAX_INPUT_HINT }) })
  }
})

const triSchema = z.boolean().nullable()
const textSchema = z.string()

const conditionSchema = z.object({
  DeviceID: z.string(),
  Timeout: z.string(),
  Kind: z.enum(OBSERVATION_KINDS),
  File: z.object({ Path: textSchema, Exists: triSchema, Type: z.enum(["", "file", "directory", "symlink"]), Contains: textSchema, Matches: textSchema, Checksum: textSchema, Mode: textSchema, Owner: textSchema, Group: textSchema }),
  Directory: z.object({ Path: textSchema, Exists: triSchema, Mode: textSchema, Owner: textSchema, Group: textSchema, HasEntries: z.array(z.string()), LacksEntries: z.array(z.string()) }),
  Process: z.object({ Name: textSchema, Matches: textSchema, User: textSchema, Running: triSchema }),
  Port: z.object({ Port: textSchema, Protocol: z.enum(["", "tcp", "udp"]), Listening: triSchema, Address: textSchema, Process: textSchema }),
  KernelParam: z.object({ Name: textSchema, Equals: textSchema, Matches: textSchema }),
  Request: z.object({ Protocol: z.enum(["tcp", "http", "https"]), Host: textSchema, Port: textSchema, Method: z.enum(["", "GET", "HEAD"]), Path: textSchema, Status: textSchema, BodyContains: textSchema, BodyMatches: textSchema }),
  Permission: z.object({ User: textSchema, Path: textSchema, Read: triSchema, Write: triSchema, Execute: triSchema }),
  Custom: z.object({ Run: textSchema, Interpreter: textSchema, User: textSchema, OutputContains: textSchema, OutputMatches: textSchema }),
}).superRefine((condition, ctx) => {
  const at = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message })
  const kind = condition.Kind
  const o = condition[kindKey(kind)] as Record<string, unknown>
  const text = (key: string) => String(o[key] ?? "")
  const absPath = (key: string) => {
    const value = text(key)
    if (!value.trim()) at([kindKey(kind), key], t("ed.b.val.pathRequired"))
    else if (!value.startsWith("/")) at([kindKey(kind), key], t("ed.b.val.pathAbsolute"))
  }
  const port = (key: string) => {
    const value = text(key).trim()
    if (!value) at([kindKey(kind), key], t("ed.b.val.portRequired"))
    else if (!(Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 65535)) at([kindKey(kind), key], t("ed.b.val.portRange"))
  }
  if (condition.DeviceID === "") at(["DeviceID"], t("ed.b.val.deviceRequired"))
  if (condition.Timeout.trim()) {
    const seconds = durationSeconds(condition.Timeout)
    if (seconds === null || seconds < 1 || seconds > 60) at(["Timeout"], t("ed.b.val.conditionTimeout"))
  }
  switch (kind) {
    case "file": {
      absPath("Path")
      const f = condition.File
      if (f.Exists === false && (f.Type || f.Contains || f.Matches || f.Checksum || f.Mode || f.Owner || f.Group)) at(["File", "Exists"], t("ed.b.val.fileAbsentAlone"))
      if (f.Checksum && !hasRef(f.Checksum) && !CHECKSUM_RE.test(f.Checksum)) at(["File", "Checksum"], t("ed.b.val.checksum"))
      if (f.Mode && !MODE_RE.test(f.Mode)) at(["File", "Mode"], t("ed.b.val.mode"))
      for (const key of ["Owner", "Group"] as const) if (f[key] && !hasRef(f[key]) && !USER_RE.test(f[key])) at(["File", key], t("ed.b.val.owner"))
      if ((f.Contains || f.Matches || f.Checksum) && f.Type && f.Type !== "file") at(["File", "Type"], t("ed.b.val.fileContentNeedsFile"))
      break
    }
    case "directory": {
      absPath("Path")
      const d = condition.Directory
      if (d.Mode && !MODE_RE.test(d.Mode)) at(["Directory", "Mode"], t("ed.b.val.mode"))
      if (d.HasEntries.length > 32 || d.LacksEntries.length > 32 || [...d.HasEntries, ...d.LacksEntries].some((name) => name.includes("/"))) at(["Directory", "HasEntries"], t("ed.b.val.dirEntries"))
      break
    }
    case "process": {
      const p = condition.Process
      if (!p.Name.trim() && !p.Matches.trim()) at(["Process", "Name"], t("ed.b.val.processNameOrMatches"))
      if (p.Name.includes("/")) at(["Process", "Name"], t("ed.b.val.processNameNoPath"))
      if (p.Running === false && p.User) at(["Process", "User"], t("ed.b.val.processUserWithStopped"))
      break
    }
    case "port": port("Port"); break
    case "kernelParam": {
      const k = condition.KernelParam
      if (!k.Name.trim()) at(["KernelParam", "Name"], t("ed.b.val.kernelName"))
      if (!k.Equals.trim() && !k.Matches.trim()) at(["KernelParam", "Equals"], t("ed.b.val.kernelValue"))
      break
    }
    case "request": {
      port("Port")
      const r = condition.Request
      if (r.Protocol !== "tcp") {
        if (r.Path && !r.Path.startsWith("/")) at(["Request", "Path"], t("ed.b.val.requestPath"))
        if (r.Status && !(Number.isInteger(Number(r.Status)) && Number(r.Status) >= 100 && Number(r.Status) <= 599)) at(["Request", "Status"], t("ed.b.val.requestStatus"))
      }
      break
    }
    case "permission": {
      const p = condition.Permission
      if (!p.User.trim()) at(["Permission", "User"], t("ed.b.val.userRequired"))
      absPath("Path")
      if (p.Read === null && p.Write === null && p.Execute === null) at(["Permission", "Read"], t("ed.b.val.permissionAction"))
      break
    }
    case "custom": {
      const c = condition.Custom
      if (!c.Run.trim()) at(["Custom", "Run"], t("ed.b.val.customRun"))
      if (c.Interpreter && !c.Interpreter.startsWith("/")) at(["Custom", "Interpreter"], t("ed.b.val.pathAbsolute"))
      break
    }
  }
})

const stateSchema = z.object({
  Mode: z.enum(["once", "continuous"]),
  Interval: z.string(),
  Manual: z.boolean(),
  Conditions: z.array(conditionSchema).max(MAX_CONDITIONS, t("ed.b.val.conditionsMax", { max: MAX_CONDITIONS })),
}).superRefine((state, ctx) => {
  if (state.Interval.trim() && state.Interval.trim() !== "0") {
    const seconds = durationSeconds(state.Interval)
    if (seconds === null || seconds < 5 || seconds > 86400) ctx.addIssue({ code: "custom", path: ["Interval"], message: t("ed.b.val.interval") })
  }
})

const checkSchema = z.object({ Kind: z.enum(["none", "answer", "state"]), Answer: answerSchema, State: stateSchema })

/** Wire key of the observation chosen in a condition (File, Directory, …) as a form key. */
export function kindKey(kind: ObservationKind): "File" | "Directory" | "Process" | "Port" | "KernelParam" | "Request" | "Permission" | "Custom" {
  return OBSERVATION_WIRE_KEY[kind]
}

export const taskSchema = z.object({
  ID: z.string(),
  Key: z.string(),
  Name: z.string().trim().min(3, t("admin.ex.val.taskName")).max(50, t("admin.ex.val.taskName")),
  Description: z.custom<Record<string, unknown> | null>(
    (v) => v === null || (typeof v === "object" && v !== null && !Array.isArray(v)),
  ),
  Difficulty: z.enum(["elementary", "trivial", "easy", "medium", "hard", "insane"]),
  Requires: z.array(z.string()).max(MAX_REQUIRES, t("ed.b.val.requiresMax", { max: MAX_REQUIRES })),
  Check: checkSchema,
  Attachments: z.array(z.object({ FileID: z.string(), Name: z.string(), ContentHash: z.string().optional() })),
  Placeholders: z.array(placeholderSchema),
  Hints: z.array(hintSchema).max(MAX_HINTS, t("exercises.hints.val.max")),
})

/**
 * Cross-task rules inside one variant: keys valid and unique, Requires known / not self / not cyclic, hint text present
 * on publish, conditions point at node devices of the variant. Called by the draft refinement (exerciseSchemas.ts).
 */
export function refineVariantTasks(
  variantIndex: number,
  tasks: TaskFormValues[],
  nodeDeviceIds: ReadonlySet<string>,
  ctx: z.RefinementCtx,
): void {
  const base = ["Variants", variantIndex, "Tasks"] as const
  const keys = new Map<string, number>()
  tasks.forEach((task, index) => {
    if (task.Key === "") return
    if (!TASK_KEY_RE.test(task.Key)) ctx.addIssue({ code: "custom", path: [...base, index, "Key"], message: t("ed.b.val.keyFormat") })
    else if (keys.has(task.Key)) ctx.addIssue({ code: "custom", path: [...base, index, "Key"], message: t("ed.b.val.keyDuplicate") })
    keys.set(task.Key, index)
  })
  tasks.forEach((task, index) => {
    // The description and the hints are read by participants: no answer or schema variable inside (23519).
    if (hasSubstitution(task.Description)) ctx.addIssue({ code: "custom", path: [...base, index, "Description"], message: t("ed.b.val.noSubstitution") })
    task.Hints.forEach((hint, hintIndex) => {
      if (!hintTextHasContent(hint.Text)) ctx.addIssue({ code: "custom", path: [...base, index, "Hints", hintIndex, "Text"], message: t("exercises.hints.val.textRequired") })
      else if (hasSubstitution(hint.Text)) ctx.addIssue({ code: "custom", path: [...base, index, "Hints", hintIndex, "Text"], message: t("ed.b.val.noSubstitution") })
    })
    const seen = new Set<string>()
    task.Requires.forEach((key, requireIndex) => {
      const path = [...base, index, "Requires", requireIndex]
      if (key === task.Key && key !== "") ctx.addIssue({ code: "custom", path, message: t("ed.b.val.requiresSelf") })
      else if (!keys.has(key)) ctx.addIssue({ code: "custom", path, message: t("ed.b.val.requiresUnknown") })
      else if (seen.has(key)) ctx.addIssue({ code: "custom", path, message: t("ed.b.val.requiresRepeat") })
      seen.add(key)
    })
    if (task.Check.Kind === "state") task.Check.State.Conditions.forEach((condition, conditionIndex) => {
      if (condition.DeviceID !== "" && !nodeDeviceIds.has(condition.DeviceID)) {
        ctx.addIssue({ code: "custom", path: [...base, index, "Check", "State", "Conditions", conditionIndex, "DeviceID"], message: t("ed.b.val.deviceRequired") })
      }
    })
  })
  // A cycle among the keys is reported once, on the first task of the cycle.
  const color = new Map<string, 0 | 1 | 2>()
  const visit = (key: string): boolean => {
    color.set(key, 1)
    const task = tasks[keys.get(key) ?? -1]
    for (const next of task?.Requires ?? []) {
      if (!keys.has(next) || next === key) continue
      if (color.get(next) === 1) return true
      if (!color.has(next) && visit(next)) return true
    }
    color.set(key, 2)
    return false
  }
  for (const key of keys.keys()) {
    if (!color.has(key) && visit(key)) {
      ctx.addIssue({ code: "custom", path: [...base, keys.get(key) as number, "Requires"], message: t("ed.b.val.requiresCycle") })
      break
    }
  }
}

// ── Factories ─────────────────────────────────────────────────────────────────

export const emptyAnswer = (type: AnswerType = "flag"): AnswerFormValues => ({ Type: type, Values: [], InputHint: "", IgnoreCase: false, Trim: true })

export const emptyState = (): StateFormValues => ({ Mode: "once", Interval: "", Manual: false, Conditions: [] })

export const emptyCheck = (kind: CheckKind = "answer"): CheckFormValues => ({ Kind: kind, Answer: emptyAnswer(), State: emptyState() })

export function emptyCondition(kind: ObservationKind = "file", deviceId = ""): ConditionFormValues {
  return {
    DeviceID: deviceId, Timeout: "", Kind: kind,
    File: { Path: "", Exists: null, Type: "", Contains: "", Matches: "", Checksum: "", Mode: "", Owner: "", Group: "" },
    Directory: { Path: "", Exists: null, Mode: "", Owner: "", Group: "", HasEntries: [], LacksEntries: [] },
    Process: { Name: "", Matches: "", User: "", Running: null },
    Port: { Port: "", Protocol: "", Listening: null, Address: "", Process: "" },
    KernelParam: { Name: "", Equals: "", Matches: "" },
    Request: { Protocol: "http", Host: "", Port: "", Method: "", Path: "", Status: "", BodyContains: "", BodyMatches: "" },
    Permission: { User: "", Path: "", Read: null, Write: null, Execute: null },
    Custom: { Run: "", Interpreter: "", User: "", OutputContains: "", OutputMatches: "" },
  }
}

/** The next free generated key («task_1», «task_2», …): task keys are never shown, the editor names them itself. */
export function nextTaskKey(tasks: Pick<TaskFormValues, "Key">[]): string {
  const used = new Set(tasks.map((task) => task.Key))
  for (let i = tasks.length + 1; ; i += 1) if (!used.has(`task_${i}`)) return `task_${i}`
}

export function emptyTask(key = ""): TaskFormValues {
  return {
    ID: "",
    Key: key,
    Name: "",
    Description: null,
    Difficulty: "easy",
    Requires: [],
    Check: emptyCheck("answer"),
    Attachments: [],
    Placeholders: [],
    Hints: [],
  }
}

export function emptyPlaceholder(): PlaceholderFormValues {
  return { Key: `ph_${crypto.randomUUID().replaceAll("-", "")}`, Kind: "ip", IPReference: "static", Gateway: "", Octets1to3: "", LastOctet: 0, ShowMask: false, DeviceName: "", AsLink: false, Scheme: "http", PortText: "", Path: "" }
}

// ── Wire -> form ──────────────────────────────────────────────────────────────

const s = (value: string | undefined) => value ?? ""
const n = (value: number | undefined) => (value ? String(value) : "")
const b = (value: boolean | null | undefined): Tri => (value === undefined ? null : value)

export function conditionToForm(dto: ConditionDTO): ConditionFormValues {
  const out = emptyCondition("file", dto.DeviceID)
  out.Timeout = s(dto.Timeout)
  if (dto.File) { out.Kind = "file"; out.File = { Path: s(dto.File.Path), Exists: b(dto.File.Exists), Type: dto.File.Type ?? "", Contains: s(dto.File.Contains), Matches: s(dto.File.Matches), Checksum: s(dto.File.Checksum), Mode: s(dto.File.Mode), Owner: s(dto.File.Owner), Group: s(dto.File.Group) } }
  else if (dto.Directory) { out.Kind = "directory"; out.Directory = { Path: s(dto.Directory.Path), Exists: b(dto.Directory.Exists), Mode: s(dto.Directory.Mode), Owner: s(dto.Directory.Owner), Group: s(dto.Directory.Group), HasEntries: dto.Directory.HasEntries ?? [], LacksEntries: dto.Directory.LacksEntries ?? [] } }
  else if (dto.Process) { out.Kind = "process"; out.Process = { Name: s(dto.Process.Name), Matches: s(dto.Process.Matches), User: s(dto.Process.User), Running: b(dto.Process.Running) } }
  else if (dto.Port) { out.Kind = "port"; out.Port = { Port: n(dto.Port.Port), Protocol: dto.Port.Protocol ?? "", Listening: b(dto.Port.Listening), Address: s(dto.Port.Address), Process: s(dto.Port.Process) } }
  else if (dto.KernelParam) { out.Kind = "kernelParam"; out.KernelParam = { Name: s(dto.KernelParam.Name), Equals: s(dto.KernelParam.Equals), Matches: s(dto.KernelParam.Matches) } }
  else if (dto.Request) { out.Kind = "request"; out.Request = { Protocol: dto.Request.Protocol, Host: s(dto.Request.Host), Port: n(dto.Request.Port), Method: dto.Request.Method ?? "", Path: s(dto.Request.Path), Status: n(dto.Request.Status), BodyContains: s(dto.Request.BodyContains), BodyMatches: s(dto.Request.BodyMatches) } }
  else if (dto.Permission) { out.Kind = "permission"; out.Permission = { User: s(dto.Permission.User), Path: s(dto.Permission.Path), Read: b(dto.Permission.Read), Write: b(dto.Permission.Write), Execute: b(dto.Permission.Execute) } }
  else if (dto.Custom) { out.Kind = "custom"; out.Custom = { Run: s(dto.Custom.Run), Interpreter: s(dto.Custom.Interpreter), User: s(dto.Custom.User), OutputContains: s(dto.Custom.OutputContains), OutputMatches: s(dto.Custom.OutputMatches) } }
  return out
}

export function checkToForm(dto: CheckDTO): CheckFormValues {
  const out = emptyCheck("none")
  if (dto.Answer) {
    out.Kind = "answer"
    out.Answer = { Type: dto.Answer.Type, Values: dto.Answer.Values ?? [], InputHint: s(dto.Answer.InputHint), IgnoreCase: dto.Answer.IgnoreCase ?? false, Trim: dto.Answer.Trim ?? true }
  } else if (dto.State) {
    out.Kind = "state"
    out.State = { Mode: dto.State.Mode ?? "once", Interval: s(dto.State.Interval), Manual: dto.State.Manual ?? false, Conditions: dto.State.Conditions.map(conditionToForm) }
  }
  return out
}

export function placeholderToForm(p: PlaceholderDTO, fallbackKey: string): PlaceholderFormValues {
  return {
    Key: p.Key || fallbackKey,
    Kind: p.Kind,
    IPReference: p.IPReference ?? "",
    Gateway: p.Gateway ?? "",
    Octets1to3: p.Octets1to3 ?? "",
    LastOctet: p.LastOctet ?? 0,
    ShowMask: p.ShowMask ?? false,
    DeviceName: p.DeviceName ?? "",
    Access: p.Access ?? "http",
    AsLink: p.AsLink ?? false,
    Scheme: p.Scheme ?? "http",
    PortText: p.Port ? String(p.Port) : "",
    Path: p.Path ?? "",
  }
}

export function taskToForm(task: NormalizedTask, variantIndex: number, taskIndex: number): TaskFormValues {
  return {
    ...task,
    Check: checkToForm(task.Check),
    Placeholders: task.Placeholders.map((p, pi) => placeholderToForm(p, `ph_legacy_${variantIndex}_${taskIndex}_${pi}`)),
  }
}

// ── Form -> wire ──────────────────────────────────────────────────────────────

export function placeholderToDTO(p: PlaceholderFormValues): PlaceholderDTO {
  switch (p.Kind) {
    case "ip":
      return {
        Key: p.Key,
        Kind: p.Kind,
        IPReference: p.IPReference,
        ...(p.IPReference === "gateway" ? { Gateway: p.Gateway } : {}),
        LastOctet: p.LastOctet,
        ShowMask: p.AsLink ? false : p.ShowMask,
        ...(p.IPReference === "static" ? { Octets1to3: p.Octets1to3 } : {}),
        ...(p.AsLink ? {
          AsLink: true,
          Scheme: p.Scheme || "http",
          ...(p.PortText ? { Port: Number(p.PortText) } : {}),
          ...(p.Path ? { Path: p.Path } : {}),
        } : {}),
      }
    case "external.link":
      return { Key: p.Key, Kind: p.Kind, DeviceName: p.DeviceName, ...(p.Access && p.Access !== "http" ? { Access: p.Access } : {}) }
    default:
      // gateway.subnet: the subnet of one gateway, named.
      return { Key: p.Key, Kind: p.Kind, Gateway: p.Gateway, ...(p.ShowMask ? { ShowMask: true } : {}) }
  }
}

const str = <K extends string, V extends string>(key: K, value: V): { [P in K]?: Exclude<V, ""> } => (value === "" ? {} : ({ [key]: value } as { [P in K]?: Exclude<V, ""> }))
const flag = <K extends string>(key: K, value: Tri): { [P in K]?: boolean } => (value === null ? {} : ({ [key]: value } as { [P in K]?: boolean }))
const num = <K extends string>(key: K, value: string): { [P in K]?: number } => (value.trim() === "" ? {} : ({ [key]: Number(value) } as { [P in K]?: number }))

export function conditionToDTO(c: ConditionFormValues): ConditionDTO {
  const base: ConditionDTO = { DeviceID: c.DeviceID, ...str("Timeout", c.Timeout.trim()) }
  switch (c.Kind) {
    case "file": { const o = c.File; return { ...base, File: { Path: o.Path, ...flag("Exists", o.Exists), ...str("Type", o.Type), ...str("Contains", o.Contains), ...str("Matches", o.Matches), ...str("Checksum", o.Checksum), ...str("Mode", o.Mode), ...str("Owner", o.Owner), ...str("Group", o.Group) } } }
    case "directory": { const o = c.Directory; return { ...base, Directory: { Path: o.Path, ...flag("Exists", o.Exists), ...str("Mode", o.Mode), ...str("Owner", o.Owner), ...str("Group", o.Group), ...(o.HasEntries.length ? { HasEntries: o.HasEntries } : {}), ...(o.LacksEntries.length ? { LacksEntries: o.LacksEntries } : {}) } } }
    case "process": { const o = c.Process; return { ...base, Process: { ...str("Name", o.Name), ...str("Matches", o.Matches), ...str("User", o.User), ...flag("Running", o.Running) } } }
    case "port": { const o = c.Port; return { ...base, Port: { Port: Number(o.Port), ...str("Protocol", o.Protocol), ...flag("Listening", o.Listening), ...str("Address", o.Address), ...str("Process", o.Process) } } }
    case "kernelParam": { const o = c.KernelParam; return { ...base, KernelParam: { Name: o.Name, ...str("Equals", o.Equals), ...str("Matches", o.Matches) } } }
    case "request": {
      const o = c.Request
      const http = o.Protocol !== "tcp"
      return { ...base, Request: { Protocol: o.Protocol, ...str("Host", o.Host), Port: Number(o.Port), ...(http ? { ...str("Method", o.Method), ...str("Path", o.Path), ...num("Status", o.Status), ...str("BodyContains", o.BodyContains), ...str("BodyMatches", o.BodyMatches) } : {}) } }
    }
    case "permission": { const o = c.Permission; return { ...base, Permission: { User: o.User, Path: o.Path, ...flag("Read", o.Read), ...flag("Write", o.Write), ...flag("Execute", o.Execute) } } }
    case "custom": { const o = c.Custom; return { ...base, Custom: { Run: o.Run, ...str("Interpreter", o.Interpreter), ...str("User", o.User), ...str("OutputContains", o.OutputContains), ...str("OutputMatches", o.OutputMatches) } } }
  }
}

export function checkToDTO(check: CheckFormValues): CheckDTO | undefined {
  if (check.Kind === "answer") {
    const a = check.Answer
    return {
      Answer: {
        Type: a.Type,
        ...(a.Values.length ? { Values: a.Values } : {}),
        ...(a.InputHint ? { InputHint: a.InputHint } : {}),
        // IgnoreCase and Trim are for the type text only (an error on flag).
        ...(a.Type === "text" && a.IgnoreCase ? { IgnoreCase: true } : {}),
        ...(a.Type === "text" && !a.Trim ? { Trim: false } : {}),
      },
    }
  }
  if (check.Kind === "state") {
    const st = check.State
    return { State: { Mode: st.Mode, ...(st.Interval.trim() ? { Interval: st.Interval.trim() } : {}), ...(st.Manual ? { Manual: true } : {}), Conditions: st.Conditions.map(conditionToDTO) } }
  }
  return undefined
}

export function taskToDTO(task: TaskFormValues): TaskDTO {
  const check = checkToDTO(task.Check)
  return {
    ...(task.ID ? { ID: task.ID } : {}),
    // The key goes back unchanged; empty on a new task: the backend sets task_<position>.
    ...(task.Key ? { Key: task.Key } : {}),
    Name: task.Name,
    ...(task.Description ? { Description: task.Description } : {}),
    Difficulty: task.Difficulty,
    ...(task.Requires.length ? { Requires: task.Requires } : {}),
    ...(check ? { Check: check } : {}),
    // ContentHash is response-only: the request names a file by its id.
    Attachments: task.Attachments.map((file) => ({ FileID: file.FileID, Name: file.Name })),
    Placeholders: task.Placeholders.map(placeholderToDTO),
    Hints: task.Hints.map((hint) => ({ ...(hint.ID ? { ID: hint.ID } : {}), Text: hint.Text, Level: hint.Level })),
  }
}
