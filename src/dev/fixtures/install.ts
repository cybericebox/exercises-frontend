/**
 * Editor fixture mode (dev only): replaces `window.fetch` for the API origin with canned answers, so the editor runs
 * without a backend and a session. Loaded by components/dev/FixtureGate.tsx only under `next dev` with
 * NEXT_PUBLIC_EDITOR_FIXTURES=1; a production build refuses the flag (next.config.ts) and never contains this code.
 *
 * Keeps the working copy in memory: a save (PUT draft) is kept until the page is reloaded.
 * Query switches on the page URL (kept for the tab in sessionStorage):
 *   ?labs=all|some|none|unknown|mixed   what the labs can run (LabCapabilities), default mixed
 *   ?deploy=fail                        a test lab that ends in Failed
 *   ?fx=reset                           forget the switches
 */
import {
  FIXTURE_ACCESS, FIXTURE_EXERCISE_ID, FIXTURE_IMAGE_SERVICES, FIXTURE_ME,
  buildCapabilities, buildDeployStatus, buildDraft, buildExercise, buildImportPreview, buildListItem, type LabsMode,
} from "./data"

const MARK = "[editor fixtures]"
const KEY = "cib-editor-fixtures"

type Switches = { labs: LabsMode; deploy: "ok" | "fail" }

function switches(): Switches {
  let saved: Partial<Switches> = {}
  try { saved = JSON.parse(sessionStorage.getItem(KEY) ?? "{}") as Partial<Switches> } catch { /* none */ }
  const query = new URLSearchParams(window.location.search)
  if (query.get("fx") === "reset") saved = {}
  const labs = query.get("labs")
  if (labs && ["all", "some", "none", "unknown", "mixed"].includes(labs)) saved.labs = labs as LabsMode
  const deploy = query.get("deploy")
  if (deploy === "fail" || deploy === "ok") saved.deploy = deploy
  try { sessionStorage.setItem(KEY, JSON.stringify(saved)) } catch { /* private window */ }
  return { labs: saved.labs ?? "mixed", deploy: saved.deploy ?? "ok" }
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify({ Status: { Code: 0, Message: "OK" }, Data: data }), { status, headers: { "Content-Type": "application/json" } })
const fail = (status: number, code: number, message: string) => new Response(JSON.stringify({ Status: { Code: code, Message: message } }), { status, headers: { "Content-Type": "application/json" } })
const empty = () => new Response(null, { status: 200 })

type Deploy = { id: string; versionId: string; variantId: string; startedAt: number }

export function installFixtures(): void {
  if ((window as unknown as Record<string, unknown>)[KEY]) return
  ;(window as unknown as Record<string, unknown>)[KEY] = true
  const original = window.fetch.bind(window)
  const draft = buildDraft()
  const exercise = buildExercise()
  const deploys = new Map<string, Deploy>()
  let counter = 0

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
    if (path === "/api/exercises/tags" || path === "/api/exercises/authors" || path === "/api/exercises/proposals" || path === "/api/exercises/bookings" || path === "/api/exercises/import/jobs") return json([])
    if (path === "/api/exercises" && method === "GET") return json({ Items: [buildListItem()], Total: 1, Page: 1, PageSize: 20 })
    if (path === "/api/events") return json({ Items: [], Total: 0, Page: 1, PageSize: 20 })
    if (path.startsWith("/api/notifications/")) return json(path.endsWith("/inbox") ? { Items: [], Unread: 0 } : path.endsWith("/pulse") ? { Unread: 0 } : [])

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
    if (path === `${ex}/usage`) return json({ Events: [] })
    if (path === `${ex}/variant-stats`) return json([])
    if (path === `${ex}/images/service`) return json(FIXTURE_IMAGE_SERVICES(((b.Images as string[]) ?? [])))
    if (path === `${ex}/images/check`) return json(((b.Images as string[]) ?? []).map((Image) => ({ Image, Status: "available" })))
    if (path === `${ex}/publish` && method === "POST") return json({ ...draft, Status: "published", PublishedAt: new Date().toISOString() })
    if (path === `${ex}/checkpoints` && method === "POST") return json({ ...draft, Status: "checkpoint" })
    if (path === "/api/exercises/import/preview") return json(buildImportPreview())

    const deploy = m(/^\/api\/exercises\/[^/]+\/versions\/([^/]+)\/variants\/([^/]+)\/deploy$/)
    if (deploy && method === "POST") {
      const id = `fx-lab-${++counter}`
      deploys.set(id, { id, versionId: deploy[1], variantId: deploy[2], startedAt: Date.now() })
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
      if (rest === "" && method === "GET") return json(buildDeployStatus(d.startedAt, Date.now(), sw.deploy === "fail"))
      if (rest === "" && method === "DELETE") { deploys.delete(d.id); return empty() }
      if (rest === "/link") return json({ URL: `https://${String(b.Device ?? "srv")}.fixture.example.test/_auth?t=fixture`, ExpiresAt: new Date(Date.now() + 60_000).toISOString() })
      if (rest === "/extend") return json({ DeployID: d.id, Lab: "fixture", ExerciseID: FIXTURE_EXERCISE_ID, VersionID: d.versionId, VariantID: d.variantId, CreatedAt: new Date(d.startedAt).toISOString(), ExpiresAt: new Date(Date.now() + 3_600_000).toISOString(), Tasks: [] })
      if (rest === "/check") return json({ Correct: String(b.Flag ?? "").startsWith("ICE{") })
      if (rest.endsWith("/run-checks")) return json({ Asked: true })
      return empty()
    }
    return null
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
