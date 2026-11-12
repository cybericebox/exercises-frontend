/**
 * Editor fixture mode (dev only): replaces `window.fetch` for the API origin with canned answers, so the editor runs
 * without a backend and a session. Loaded by components/dev/FixtureGate.tsx only under `next dev` with
 * NEXT_PUBLIC_EDITOR_FIXTURES=1; a production build refuses the flag (next.config.ts) and never contains this code.
 *
 * Keeps the working copy in memory: a save (PUT draft) is kept until the page is reloaded.
 * Query switches on the page URL (kept for the tab in sessionStorage):
 *   ?labs=all|some|none|unknown|mixed   what the labs can run (LabCapabilities), default mixed
 *   ?deploy=ok|fail|retry|expired|ending|devfail  a test lab that comes up / ends in Failed / retries an initialization / is out of time / is about to end
 *   ?console=ok|none|fail               the console link: a frame page / 404 (no console in the lab) / a server error
 *   ?vpnReverse=blocked|allowed|not_enforced  what is in force for connections the lab starts to the VPN clients
 *   ?age=N                             a test lab starts N seconds old
 *   ?shape=needless|rich                 the linked variant differs only by an answer that reaches the lab (needless) / the rich sample
 *   ?serverError=device|variables|access|profile|description|hint|answer|state|variable|unplaced|ambiguous|variant  a document error with its context on publish (&serverErrorAt=save: on the draft save); ?serverError= clears it
 *   ?fx=reset                           forget the switches
 * An import archive named «new» or «blocked» (task-new.zip) previews as a new exercise / with blocked events;
 * uploads (chunks included) are answered, nothing is stored.
 */
import {
  FIXTURE_ACCESS, FIXTURE_EXERCISE_ID, FIXTURE_IMAGE_SERVICES, FIXTURE_ME,
  buildCapabilities, buildDeployStatus, buildDraft, buildExercise, buildImportPreview, buildListItem, type DraftShape, type ImportKind, type LabsMode,
} from "./data"

const MARK = "[editor fixtures]"
const KEY = "cib-editor-fixtures"

/** A document error with its public context, as the daemon answers a save or a publish (`?serverError=…`, `&serverErrorAt=save`). */
const SERVER_ERRORS = {
  device: { code: 23506, context: { device: "srv", field: "bootstrap.script" } },
  variables: { code: 23506, context: { device: "srv", field: "bootstrap.env[1].name" } },
  access: { code: 23506, context: { device: "r1", field: "access[1].command" } },
  profile: { code: 23105, context: { device: "r2", field: "persistence" } },
  description: { code: 23519, context: { task: "secret", field: "description" } },
  hint: { code: 23519, context: { task: "ospf", field: "hints[2].text" } },
  answer: { code: 23504, context: { task: "theory", field: "check.answer.values", variant: 1 } },
  state: { code: 23505, context: { task: "ospf", field: "check.state.conditions[2].file.path" } },
  variable: { code: 23507, context: { field: "variables[1].name" } },
  unplaced: { code: 73509, context: { features: "guest_agent" } },
  // An answer can be in the base and in the linked variant: ambiguous without `variant`, so form-level (a toast); with it, placed.
  ambiguous: { code: 23504, context: { task: "secret", field: "check.answer.values" } },
  variant: { code: 23504, context: { task: "secret", field: "check.answer.values", variant: 2 } },
} as const
type ServerErrorKind = keyof typeof SERVER_ERRORS

type DeployMode = "ok" | "fail" | "retry" | "expired" | "ending" | "devfail"
type Switches = { labs: LabsMode; deploy: DeployMode; console: "ok" | "none" | "fail"; vpnReverse: "blocked" | "allowed" | "not_enforced"; shape: DraftShape; serverError: ServerErrorKind | ""; serverErrorAt: "publish" | "save" }

function switches(): Switches {
  let saved: Partial<Switches> = {}
  try { saved = JSON.parse(sessionStorage.getItem(KEY) ?? "{}") as Partial<Switches> } catch { /* none */ }
  const query = new URLSearchParams(window.location.search)
  if (query.get("fx") === "reset") saved = {}
  const labs = query.get("labs")
  if (labs && ["all", "some", "none", "unknown", "mixed"].includes(labs)) saved.labs = labs as LabsMode
  const deploy = query.get("deploy")
  if (deploy && ["ok", "fail", "retry", "expired", "ending", "devfail"].includes(deploy)) saved.deploy = deploy as DeployMode
  const shape = query.get("shape")
  if (shape === "needless" || shape === "rich") saved.shape = shape
  const consoleMode = query.get("console")
  if (consoleMode === "ok" || consoleMode === "none" || consoleMode === "fail") saved.console = consoleMode
  const reverse = query.get("vpnReverse")
  if (reverse === "blocked" || reverse === "allowed" || reverse === "not_enforced") saved.vpnReverse = reverse
  const serverError = query.get("serverError")
  if (serverError !== null) saved.serverError = serverError in SERVER_ERRORS ? serverError as ServerErrorKind : ""
  const serverErrorAt = query.get("serverErrorAt")
  if (serverErrorAt === "save" || serverErrorAt === "publish") saved.serverErrorAt = serverErrorAt
  try { sessionStorage.setItem(KEY, JSON.stringify(saved)) } catch { /* private window */ }
  return { labs: saved.labs ?? "mixed", deploy: saved.deploy ?? "ok", console: saved.console ?? "ok", vpnReverse: saved.vpnReverse ?? "blocked", shape: saved.shape ?? "rich", serverError: saved.serverError ?? "", serverErrorAt: saved.serverErrorAt ?? "publish" }
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify({ Status: { Code: 0, Message: "OK" }, Data: data }), { status, headers: { "Content-Type": "application/json" } })
const fail = (status: number, code: number, message: string, context?: Record<string, string | number>) => new Response(JSON.stringify({ Status: { Code: code, Message: message, ...(context ? { Context: context } : {}) } }), { status, headers: { "Content-Type": "application/json" } })
const empty = () => new Response(null, { status: 200 })

type Deploy = { id: string; versionId: string; variantId: string; startedAt: number }

export function installFixtures(): void {
  if ((window as unknown as Record<string, unknown>)[KEY]) return
  ;(window as unknown as Record<string, unknown>)[KEY] = true
  const original = window.fetch.bind(window)
  const draft = buildDraft(switches().shape)
  const exercise = buildExercise()
  const deploys = new Map<string, Deploy>()
  let counter = 0
  const uploadNames = new Map<string, string>()
  const uploadStatus = (id: string, received: number) => ({ UploadID: id, Name: uploadNames.get(id) ?? "", Size: 22, ChunkSize: 1_048_576, Chunks: 1, ChunksReceived: received, ReceivedBytes: received * 22, ExpiresAt: new Date(Date.now() + 3_600_000).toISOString() })
  const importKind = (source: string): ImportKind => { const name = uploadNames.get(source) ?? ""; return name.includes("blocked") ? "blocked" : name.includes("new") ? "new" : "update" }
  // Upload chunks go through XMLHttpRequest (progress), which fetch cannot cover: answer them here.
  const NativeXhr = window.XMLHttpRequest
  window.XMLHttpRequest = class extends NativeXhr {
    private canned = false
    private cannedId = ""
    open(method: string, url: string | URL, ...rest: [boolean?, (string | null)?, (string | null)?]) {
      const hit = /\/api\/exercises\/uploads\/([^/]+)\/chunks\/\d+$/.exec(String(url))
      this.canned = (method === "PUT" && Boolean(hit)) || (method === "POST" && /\/api\/exercises\/files$/.test(String(url)))
      this.cannedId = hit?.[1] ?? ""
      super.open(method, url, ...(rest as [boolean]))
    }
    send(body?: Document | XMLHttpRequestBodyInit | null) {
      if (!this.canned) return super.send(body)
      Object.defineProperty(this, "status", { value: 200 })
      // A small file (multipart POST /files) answers with its stored copy; a chunk answers with the upload status.
      const sent = body instanceof FormData ? body.get("file") : null
      const data = this.cannedId ? uploadStatus(this.cannedId, 1) : { FileID: `fx-file-${++counter}`, Name: sent instanceof File ? sent.name : "file", Size: sent instanceof File ? sent.size : 0 }
      Object.defineProperty(this, "responseText", { value: JSON.stringify({ Status: { Code: 0, Message: "OK" }, Data: data }) })
      queueMicrotask(() => this.onload?.(new ProgressEvent("load")))
    }
  } as typeof XMLHttpRequest
  // The times of the manual check asks, for the limit of three a minute (429).
  const asks: number[] = []

  async function route(method: string, url: URL, body: unknown): Promise<Response | null> {
    const path = url.pathname.replace(/\/+$/, "")
    const sw = switches()
    const b = (body ?? {}) as Record<string, unknown>
    const m = (pattern: RegExp) => pattern.exec(path)
    const ex = `/api/exercises/${FIXTURE_EXERCISE_ID}`

    if (path === "/api/auth/me") return json(FIXTURE_ME)
    if (path === "/api/exercises/access") return json(FIXTURE_ACCESS)
    if (path === "/api/exercises/capabilities") return json(buildCapabilities(sw.labs))
    if (path === "/api/exercises/flag-policy") return json({ RandomHexLength: 16, RandomBits: 64, WarningBits: 24 })
    if (path === "/api/exercises/test-runs/lengths") return json({ AllowedMinutes: [30, 60, 120], DefaultMinutes: 60 })
    if (path === "/api/exercises/preferences/catalog-columns") return json(method === "PUT" ? body : [])
    if (path === "/api/exercises/tags") {
      // The tags that exist in the catalog, most used first; the daemon matches the prefix.
      const prefix = (url.searchParams.get("prefix") ?? "").toLowerCase()
      return json([{ Tag: "web", Count: 14 }, { Tag: "network", Count: 9 }, { Tag: "routing", Count: 6 }, { Tag: "crypto", Count: 5 }, { Tag: "forensics", Count: 3 }, { Tag: "ospf", Count: 2 }].filter(({ Tag }) => Tag.startsWith(prefix)))
    }
    if (path === "/api/exercises/authors" || path === "/api/exercises/proposals" || path === "/api/exercises/bookings" || path === "/api/exercises/import/jobs") return json([])
    if (path === "/api/exercises" && method === "GET") return json({ Items: [buildListItem()], Total: 1, Page: 1, PageSize: 20 })
    if (path === "/api/events") return json({ Items: [], Total: 0, Page: 1, PageSize: 20 })
    if (path.startsWith("/api/notifications/")) return json(path.endsWith("/inbox") ? { Items: [], Unread: 0 } : path.endsWith("/pulse") ? { Unread: 0 } : [])

    if (sw.serverError && ((path === `${ex}/publish` && method === "POST" && sw.serverErrorAt === "publish") || (path === `${ex}/draft` && method === "PUT" && sw.serverErrorAt === "save"))) {
      const e = SERVER_ERRORS[sw.serverError]
      return fail(400, e.code, "fixture document error", e.context)
    }
    if (path === ex) {
      if (method === "PATCH") { Object.assign(exercise, b); draft.Name = exercise.Name; return json(exercise) }
      return json(exercise)
    }
    if (path === `${ex}/draft`) {
      if (method === "PUT") {
        const sent = b as { AdminNote?: string; Variants?: unknown[] }
        if (typeof sent.AdminNote === "string") draft.AdminNote = sent.AdminNote
        if (Array.isArray(sent.Variants)) draft.Variants = sent.Variants as typeof draft.Variants
        exercise.HasChanges = true
      }
      return json(draft)
    }
    if (path === `${ex}/draft/document`) return new Response(await documentYaml(draft), { status: 200, headers: { "Content-Type": "application/yaml; charset=utf-8" } })
    if (path === `${ex}/versions`) return json([{ ID: draft.ID, Status: "draft", AdminNote: draft.AdminNote, Label: "", VariantCount: draft.Variants.length, CreatedAt: draft.CreatedAt, CreatedBy: draft.CreatedBy, AuthorName: draft.AuthorName, PublishedAt: null }])
    if (m(new RegExp(`^${ex}/versions/[^/]+$`)) && method === "GET") return json(draft)
    if (path === `${ex}/usage`) return json({ Events: [] })
    if (path === `${ex}/variant-stats`) return json([])
    if (path === `${ex}/images/service`) return json(FIXTURE_IMAGE_SERVICES(((b.Images as string[]) ?? [])))
    if (path === `${ex}/images/check`) return json(((b.Images as string[]) ?? []).map((Image) => ({ Image, Status: "available" })))
    // Image upload (the blobs travel as chunked uploads, answered by the XHR/uploads cases above): every blob is missing, then present.
    if (path === `${ex}/images/blobs/missing` && method === "POST") return json({ Missing: (b.Digests as string[]) ?? [] })
    if (path === `${ex}/images/blobs` && method === "POST") return json({ State: "present" })
    if (path === `${ex}/images` && method === "POST") return json({ Reference: `platform/${String(b.Name ?? "image").replace(/[^a-z0-9._-]/gi, "-").toLowerCase()}:latest` })
    if (path === `${ex}/publish` && method === "POST") { await new Promise((resolve) => setTimeout(resolve, 900)); return json({ ...draft, Status: "published", PublishedAt: new Date().toISOString() }) }
    if (path === `${ex}/checkpoints` && method === "POST") return json({ ...draft, Status: "checkpoint" })
    if (path === "/api/exercises/import/preview") return json(buildImportPreview(importKind(String((b as { UploadID?: string; FileID?: string }).UploadID ?? (b as { FileID?: string }).FileID ?? ""))))
    if (path === "/api/exercises/uploads" && method === "POST") { const id = `up-${++counter}`; uploadNames.set(id, String(b.Name ?? "")); return json(uploadStatus(id, 0)) }
    if (/^\/api\/exercises\/[^/]+\/files\/lookup$/.test(path)) return json({ Found: false, FileID: "", Name: "", Size: 0 })
    const upload = m(/^\/api\/exercises\/uploads\/([^/]+)\/complete$/)
    if (upload && method === "POST") return json({ FileID: upload[1], Name: uploadNames.get(upload[1]) ?? "", Size: 22 })

    const deploy = m(/^\/api\/exercises\/[^/]+\/versions\/([^/]+)\/variants\/([^/]+)\/deploy$/)
    if (deploy && method === "POST") {
      const id = `fx-lab-${++counter}`
      // ?age=N: the lab is created as if N seconds old (to reach a later state at once).
      const age = Number(new URLSearchParams(window.location.search).get("age")) || 0
      deploys.set(id, { id, versionId: deploy[1], variantId: deploy[2], startedAt: Date.now() - age * 1000 })
      const variant = draft.Variants.find((item) => item.ID === deploy[2]) ?? draft.Variants[0]
      return json({ DeployID: id, Lab: "fixture", Kind: "lab", Tasks: variant.Tasks.filter((task) => task.Check && "Answer" in task.Check).map((task) => ({ TaskID: task.ID, Name: task.Name })) })
    }
    if (path === "/api/exercises/deploys" && method === "GET") {
      return json([...deploys.values()].map((d) => ({
        DeployID: d.id, Lab: "fixture", Kind: "lab", ExerciseID: FIXTURE_EXERCISE_ID, VersionID: d.versionId, VariantID: d.variantId,
        CreatedAt: new Date(d.startedAt).toISOString(), ExpiresAt: new Date(d.startedAt + 3_600_000).toISOString(), Tasks: [], SolvedTaskIDs: [],
      })))
    }
    const lab = m(/^\/api\/exercises\/deploys\/([^/]+)(\/.*)?$/)
    if (lab) {
      const d = deploys.get(lab[1])
      const rest = lab[2] ?? ""
      if (!d) return fail(404, 72801, "deploy not found")
      if (rest === "" && method === "GET") return json(deployStatus(d.startedAt, sw))
      if (rest === "" && method === "DELETE") { deploys.delete(d.id); return empty() }
      if (rest === "/link" && b.Access === "terminal") {
        if (sw.console === "none") return fail(404, 33518, "the lab has no console for this device")
        if (sw.console === "fail") return fail(500, 500, "console link failed")
        const page = `<body style="font:14px monospace;background:#111;color:#9f9;margin:0;padding:12px">${String(b.Device)}:~# console fixture (a real console page is served by the lab)</body>`
        return json({ URL: URL.createObjectURL(new Blob([page], { type: "text/html" })), ExpiresAt: new Date(Date.now() + 60_000).toISOString() })
      }
      if (rest === "/link") return json({ URL: `https://${String(b.Device ?? "srv")}-ab1t.labs.${window.location.hostname}/_auth?t=fixture`, ExpiresAt: new Date(Date.now() + 60_000).toISOString() })
      if (rest === "/extend") return json({ DeployID: d.id, Lab: "fixture", ExerciseID: FIXTURE_EXERCISE_ID, VersionID: d.versionId, VariantID: d.variantId, CreatedAt: new Date(d.startedAt).toISOString(), ExpiresAt: new Date(Date.now() + 3_600_000).toISOString(), Tasks: [] })
      if (rest === "/check") return json({ Correct: String(b.Flag ?? "").startsWith("ICE{") })
      if (rest.endsWith("/run-checks")) {
        const now = Date.now()
        while (asks.length > 0 && now - asks[0] > 60_000) asks.shift()
        if (asks.length >= 3) return new Response(JSON.stringify({ Status: { Code: 73516, Message: "too often" } }), { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "20" } })
        asks.push(now)
        return json({ Asked: true })
      }
      return empty()
    }
    return null
  }

  // Attachment upload goes through XMLHttpRequest (progress): answer it here, so a dropped file lands in the task.
  const xhrOpen = XMLHttpRequest.prototype.open
  const xhrSend = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest & { __fx?: { method: string; url: string } }, method: string, url: string | URL, ...rest: unknown[]) {
    this.__fx = { method: method.toUpperCase(), url: String(url) }
    return (xhrOpen as (...args: unknown[]) => void).call(this, method, url, ...rest)
  } as typeof XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.send = function (this: XMLHttpRequest & { __fx?: { method: string; url: string } }, body?: Document | XMLHttpRequestBodyInit | null) {
    if (this.__fx?.method === "POST" && new URL(this.__fx.url, window.location.href).pathname === "/api/exercises/files") {
      const file = body instanceof FormData ? (body.get("file") as File | null) : null
      const data = { Data: { FileID: crypto.randomUUID(), Name: file?.name ?? "file", Size: file?.size ?? 0 } }
      const done = (name: string, value: unknown) => Object.defineProperty(this, name, { configurable: true, value })
      window.setTimeout(() => {
        done("status", 200); done("responseText", JSON.stringify(data)); done("readyState", 4)
        this.onload?.(new ProgressEvent("load"))
      }, 200)
      return
    }
    return xhrSend.call(this, body)
  }

  window.fetch = async (input, init) => {
    const request = input instanceof Request ? input : null
    const raw = request ? request.url : String(input)
    let url: URL
    try { url = new URL(raw, window.location.href) } catch { return original(input, init) }
    // Only the API origin (https://api.<domain>) and same-origin /api calls are canned; everything else is the dev server's.
    if (!url.pathname.startsWith("/api/") || (url.hostname !== window.location.hostname && !url.hostname.startsWith("api."))) return original(input, init)
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase()
    let body: unknown = undefined
    const text = typeof init?.body === "string" ? init.body : undefined
    if (text) { try { body = JSON.parse(text) } catch { body = undefined } }
    const answer = await route(method, url, body)
    if (answer) return answer
    console.warn(`${MARK} no canned answer for ${method} ${url.pathname}`)
    return fail(404, 404, "no canned answer")
  }
  console.info(`${MARK} on: open /detail/?id=${FIXTURE_EXERCISE_ID}`)
}

/** The canned status of a test lab for the chosen outcome. */
function deployStatus(startedAt: number, sw: Switches) {
  const now = Date.now()
  const seconds = (now - startedAt) / 1000
  const status = buildDeployStatus(startedAt, now, sw.deploy === "fail") as Record<string, unknown> & { Devices?: Record<string, unknown>[] }
  if (sw.deploy === "retry" && seconds >= 7 && seconds < 40) {
    // srv initializes more than once: attempt 1, then 2, then it passes.
    const attempt = seconds < 20 ? 1 : 2
    return { ...status, Phase: "Provisioning", Ready: false, Devices: [{ Name: "r1", Ready: true }, { Name: "r2", Ready: true, Bootstrap: { Phase: "done", Attempts: 1, Reason: "" } }, { Name: "srv", Ready: false, Bootstrap: { Phase: "pending", Attempts: attempt, Reason: "" } }] }
  }
  // The lab is ready but the initialization of srv failed after three attempts.
  if (sw.deploy === "devfail" && status.Ready) return { ...status, Devices: (status.Devices ?? []).map((entry) => entry.Name === "srv" ? { ...entry, Bootstrap: { Phase: "failed", Attempts: 3, Reason: "script exited with 1" } } : entry) }
  if (sw.deploy === "expired" && status.Ready) return { ...status, Expired: true, ExpiresAt: new Date(now - 1000).toISOString() }
  if (sw.deploy === "ending" && status.Ready) return { ...status, ExpiresAt: new Date(now + 4 * 60_000).toISOString(), EndingAt: new Date(now + 4 * 60_000).toISOString() }
  if (status.Ready) return { ...status, VPNReverse: sw.vpnReverse, ReverseConnections: sw.vpnReverse === "allowed" }
  return status
}

/** A small YAML writer for the «Документ» dialog (the real one is the daemon's). */
async function documentYaml(draft: ReturnType<typeof buildDraft>): Promise<string> {
  const scalar = (value: unknown): string => typeof value === "string" ? (/^[\w./:-]+$/.test(value) && value !== "" ? value : JSON.stringify(value)) : String(value)
  const dump = (value: unknown, indent: number): string => {
    const pad = "  ".repeat(indent)
    if (Array.isArray(value)) return value.length === 0 ? " []" : "\n" + value.map((item) => `${pad}-${typeof item === "object" && item !== null ? dump(item, indent + 1).replace(/^\n\s*/, " ") : " " + scalar(item)}`).join("\n")
    if (value && typeof value === "object") {
      const entries = Object.entries(value).filter(([, v]) => v !== undefined && v !== null)
      if (entries.length === 0) return " {}"
      return "\n" + entries.map(([key, v]) => `${pad}${key}:${typeof v === "object" ? dump(v, indent + 1) : " " + scalar(v)}`).join("\n")
    }
    return " " + scalar(value)
  }
  const strip = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (key, v) => (key === "Description" && v && typeof v === "object" ? "(rich text)" : v)))
  return `schema: cib-exercise/1.0${dump({ exercise: { name: draft.Name, description: draft.Description, tags: draft.Tags }, versions: [{ admin_note: draft.AdminNote, variants: strip(draft.Variants) }] }, 0)}\n`
}
