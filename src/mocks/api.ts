/**
 * Dev-only mock API (NEXT_PUBLIC_USE_MOCKS=1): answers the catalog app's requests
 * in memory so the UI can be demoed and screenshotted without a backend.
 * `?mock=manager` switches to an event manager (kept in sessionStorage);
 * `?mock=admin` switches back.
 */

type Json = Record<string, unknown>

const now = "2026-09-29T09:30:00Z"

function paragraph(text: string): Json {
  return {
    root: {
      type: "root", version: 1, direction: "ltr", format: "", indent: 0,
      children: [{
        type: "paragraph", version: 1, direction: "ltr", format: "", indent: 0, textFormat: 0, textStyle: "",
        children: [{ type: "text", version: 1, text, format: 0, detail: 0, mode: "normal", style: "" }],
      }],
    },
  }
}

const ADMIN_ME = { ID: "u-admin", FirstName: "Олена", LastName: "Коваль", Email: "olena@cybericebox.local", Role: "super_admin", Permissions: ["*"] }
const MANAGER_ME = { ID: "u-manager", FirstName: "Андрій", LastName: "Мельник", Email: "andrii@cybericebox.local", Role: "user", Permissions: [] as string[] }

const EVENTS = [
  { ID: "ev-winter", Name: "Winter CTF 2026", Tag: "winter", CanWrite: true, InfrastructureAllowed: false },
  { ID: "ev-spring", Name: "Spring Cyber Cup", Tag: "spring", CanWrite: true, InfrastructureAllowed: true },
]
const PLATFORM_EVENTS = [
  ...EVENTS.map(({ ID, Name, Tag }) => ({ ID, Name, Tag })),
  { ID: "ev-school", Name: "Шкільна ліга", Tag: "school" },
  { ID: "ev-uni", Name: "University Challenge", Tag: "uni" },
]

const ALL_RIGHTS = { CanRead: true, CanEdit: true, CanPublish: true, CanDelete: true, CanManageAccess: true, CanPropose: false, CanExport: true }
const MANAGER_EVENT_RIGHTS = { CanRead: true, CanEdit: true, CanPublish: true, CanDelete: true, CanManageAccess: false, CanPropose: true, CanExport: false }
const READ_ONLY = { CanRead: true, CanEdit: false, CanPublish: false, CanDelete: false, CanManageAccess: false, CanPropose: false, CanExport: false }

type MockExercise = Json & {
  ID: string; Name: string; Description: string; Tags: string[]; Scope: "catalog" | "event"; OwnerEventID: string | null
  OwnerEventName: string; AccessLevel: string; Infrastructure: boolean; HasDraft: boolean; HasPublished: boolean
  ArchivedAt: string | null; PendingProposalID: string | null
}

function exercise(patch: Partial<MockExercise> & { ID: string; Name: string }): MockExercise {
  return {
    Description: "", Tags: [], Scope: "catalog", OwnerEventID: null, OwnerEventName: "", AccessLevel: "all", AccessEventIDs: [],
    OriginEventID: null, ForkedFrom: null, Infrastructure: false, PendingProposalID: null, HasDraft: false, HasPublished: true,
    ArchivedAt: null, CreatedAt: "2026-09-01T10:00:00Z", UpdatedAt: now, CreatedBy: "u-admin", UpdatedBy: "u-admin",
    DraftVersionID: null, PublishedVersionID: `${patch.ID}-pub`, HasChanges: false,
    ...patch,
  }
}

const EXERCISES: MockExercise[] = [
  exercise({ ID: "ex-sqli", Name: "SQL-ін'єкції: основи", Description: "Логін без пароля через вразливий запит", Tags: ["web", "sql"], AccessLevel: "all" }),
  exercise({ ID: "ex-ssh", Name: "SSH-бастіон", Description: "Перехід між сегментами мережі", Tags: ["network"], Infrastructure: true, AccessLevel: "selected", AccessEventIDs: ["ev-spring"] }),
  exercise({ ID: "ex-headers", Name: "HTTP-заголовки", Description: "X-Forwarded-For та довіра до проксі", Tags: ["web"], AccessLevel: "own", OriginEventID: "ev-spring", HasDraft: true, HasChanges: true }),
  exercise({ ID: "ex-winter-crypto", Name: "Шифр Віженера", Description: "Класична криптографія", Tags: ["crypto"], Scope: "event", OwnerEventID: "ev-winter", OwnerEventName: "Winter CTF 2026", AccessLevel: "" }),
  exercise({ ID: "ex-winter-web", Name: "SQL-ін'єкції (зимова версія)", Description: "Адаптовано під Winter CTF", Tags: ["web"], Scope: "event", OwnerEventID: "ev-winter", OwnerEventName: "Winter CTF 2026", AccessLevel: "", ForkedFrom: { ExerciseID: "ex-sqli", ExerciseName: "SQL-ін'єкції: основи", VersionID: "ex-sqli-pub" }, PendingProposalID: "prop-1" }),
  exercise({ ID: "ex-spring-lab", Name: "Мережевий форензик", Description: "Аналіз трафіку в лабораторії", Tags: ["forensics", "network"], Scope: "event", OwnerEventID: "ev-spring", OwnerEventName: "Spring Cyber Cup", AccessLevel: "", Infrastructure: true, HasDraft: true, HasChanges: true }),
  exercise({ ID: "ex-osint", Name: "OSINT: слід у мережі", Description: "Пошук за відкритими джерелами", Tags: ["osint"], AccessLevel: "all", HasPublished: false, PublishedVersionID: null, HasDraft: true, HasChanges: true }),
  exercise({ ID: "ex-stego", Name: "Стеганографія в PNG", Description: "Приховані дані в зображенні", Tags: ["forensics"], AccessLevel: "selected", AccessEventIDs: ["ev-winter", "ev-school"] }),
]

let proposals: Json[] = [
  { ID: "prop-1", ExerciseID: "ex-winter-web", ExerciseName: "SQL-ін'єкції (зимова версія)", EventID: "ev-winter", EventName: "Winter CTF 2026", Status: "pending",
    Note: "Команди-новачки розв'язували за 20 хвилин, варто додати в каталог.", ProposedBy: "u-manager", ProposedByName: "Андрій Мельник", ProposedAt: "2026-09-27T14:05:00Z",
    DecidedAt: null, DecisionNote: "", CatalogExerciseID: null },
  { ID: "prop-2", ExerciseID: "ex-spring-lab", ExerciseName: "Мережевий форензик", EventID: "ev-spring", EventName: "Spring Cyber Cup", Status: "pending",
    Note: "Лабораторія стабільна, можна пропонувати іншим подіям.", ProposedBy: "u-manager-2", ProposedByName: "Ірина Шевчук", ProposedAt: "2026-09-28T08:40:00Z",
    DecidedAt: null, DecisionNote: "", CatalogExerciseID: null },
]

function hint(ID: string, Text: string, Cost: number) {
  return { ID, Text, Cost }
}

function version(exerciseId: string, status: string): Json {
  const ex = EXERCISES.find((item) => item.ID === exerciseId)
  const devices = ex?.Infrastructure ? [{
    ID: "11111111-2222-3333-4444-555555555555", Name: "web", Type: "container", Image: "nginx:1.27",
    Interfaces: [{ Name: "eth0", IP: { Type: "dhcp" } }], EnvVars: [],
  }] : []
  const task = (id: string, name: string, text: string, hints: { ID: string; Text: string; Cost: number }[]) => ({
    ID: id, Name: name, Description: paragraph(text), Difficulty: "easy", Flag: ["ICE{demo_flag}"], Attachments: [], Placeholders: [], Hints: hints,
  })
  return {
    ID: `${exerciseId}-${status === "draft" ? "draft" : "pub"}`, ExerciseID: exerciseId, Status: status, AdminNote: "", Label: "",
    CreatedAt: "2026-09-20T10:00:00Z", CreatedBy: "u-admin", PublishedAt: status === "published" ? "2026-09-20T10:00:00Z" : null,
    Variants: [1, 2].map((index) => ({
      ID: `${exerciseId}-v${index}`, Index: index, Note: "",
      Tasks: [
        task("t-login", "Обхід авторизації", "Увійдіть як адміністратор без пароля.", [
          hint("h-1", index === 1 ? "Подивіться, як форма формує SQL-запит." : "Зверніть увагу на поле імені користувача.", 0),
          hint("h-2", index === 1 ? "Спробуйте закоментувати перевірку пароля: ' OR 1=1 --" : "Коментар у SQL починається з --", 50),
          hint("h-3", "", 120),
        ]),
        task("t-dump", "Витяг таблиці користувачів", "Отримайте хеш пароля адміністратора.", []),
      ],
      Topology: { VPN: { Enabled: false, DHCP: true }, Internet: { Enabled: false, DHCP: true }, Devices: devices, Connections: [] },
    })),
  }
}

function role(): "admin" | "manager" {
  try {
    const param = new URLSearchParams(window.location.search).get("mock")
    if (param === "manager" || param === "admin") window.sessionStorage.setItem("exercises.mockRole", param)
    return window.sessionStorage.getItem("exercises.mockRole") === "manager" ? "manager" : "admin"
  } catch {
    return "admin"
  }
}

function permissionsFor(item: MockExercise, isAdmin: boolean) {
  if (isAdmin) return item.Scope === "event" ? { ...ALL_RIGHTS, CanManageAccess: false } : ALL_RIGHTS
  return item.Scope === "event" ? { ...MANAGER_EVENT_RIGHTS, CanPropose: !item.PendingProposalID && Boolean(item.PublishedVersionID) } : READ_ONLY
}

function visibleTo(isAdmin: boolean) {
  return EXERCISES.filter((item) => isAdmin || (item.Scope === "event"
    ? EVENTS.some((event) => event.ID === item.OwnerEventID)
    : item.HasPublished && !item.ArchivedAt && (item.AccessLevel === "all" || (item.AccessEventIDs as string[]).some((id) => EVENTS.some((event) => event.ID === id)) || EVENTS.some((event) => event.ID === item.OriginEventID))))
}

class MockError extends Error {
  constructor(public status: number, public code: number, message: string) { super(message) }
}

function list(query: URLSearchParams, isAdmin: boolean): Json {
  const search = (query.get("search") ?? "").toLowerCase()
  const scope = query.get("scope")
  const event = query.get("event")
  const infra = query.get("infrastructure")
  const archived = query.get("archived") === "only"
  const items = visibleTo(isAdmin).filter((item) =>
    (!search || item.Name.toLowerCase().includes(search)) &&
    (!scope || item.Scope === scope) &&
    (!event || item.OwnerEventID === event || (item.Scope === "catalog" && (item.AccessLevel === "all" || (item.AccessEventIDs as string[]).includes(event)))) &&
    (!infra || item.Infrastructure === (infra === "yes")) &&
    (archived ? Boolean(item.ArchivedAt) : !item.ArchivedAt))
  return { Items: items.map((item) => ({ ...item, Permissions: permissionsFor(item, isAdmin) })), Total: items.length, Page: 1, PageSize: 50 }
}

function body(init?: BodyInit | null): Json {
  try { return typeof init === "string" ? JSON.parse(init) as Json : {} } catch { return {} }
}

function route(method: string, path: string, init?: BodyInit | null): unknown {
  const url = new URL(path, "https://mock.local")
  const parts = url.pathname.split("/").filter(Boolean)
  const isAdmin = role() === "admin"

  if (url.pathname === "/api/auth/me") return isAdmin ? ADMIN_ME : MANAGER_ME
  if (url.pathname === "/api/notifications/banners") return []
  if (url.pathname.startsWith("/api/users/")) return { ID: parts[2], FirstName: "Олена", LastName: "Коваль" }
  if (url.pathname === "/api/events") return { Items: PLATFORM_EVENTS, Total: PLATFORM_EVENTS.length, Page: 1, PageSize: 200 }
  if (parts[0] !== "api" || parts[1] !== "exercises") throw new MockError(404, 0, "not found")

  const rest = parts.slice(2)
  if (rest.length === 0 && method === "GET") return list(url.searchParams, isAdmin)
  if (rest.length === 0 && method === "POST") {
    const input = body(init)
    const owner = typeof input.OwnerEventID === "string" ? input.OwnerEventID : null
    const created = exercise({
      ID: `ex-new-${EXERCISES.length}`, Name: String(input.Name ?? "Нове завдання"), Scope: owner ? "event" : "catalog", OwnerEventID: owner,
      OwnerEventName: EVENTS.find((event) => event.ID === owner)?.Name ?? "", AccessLevel: owner ? "" : "all",
      HasPublished: false, PublishedVersionID: null, HasDraft: true, HasChanges: true,
    })
    EXERCISES.push(created)
    return { ...created, Permissions: permissionsFor(created, isAdmin) }
  }
  if (rest[0] === "access") {
    return isAdmin
      ? { IsAdmin: true, CanCreateCatalog: true, CanPublish: true, CanDelete: true, CanExport: true, Events: [] }
      : { IsAdmin: false, CanCreateCatalog: false, CanPublish: false, CanDelete: false, CanExport: false, Events: EVENTS }
  }
  if (rest[0] === "capabilities") return { Laboratories: true }
  if (rest[0] === "flag-policy") return { RandomHexLength: 16, RandomBits: 64, WarningBits: 48 }
  if (rest[0] === "tags") return [{ Tag: "web", Count: 3 }, { Tag: "network", Count: 2 }, { Tag: "crypto", Count: 1 }]
  if (rest[0] === "proposals" && rest.length === 1) {
    const status = url.searchParams.get("status") ?? "pending"
    return proposals.filter((proposal) => proposal.Status === status)
  }
  if (rest[0] === "proposals" && rest[2]) {
    const proposal = proposals.find((item) => item.ID === rest[1])
    if (!proposal) throw new MockError(404, 30954, "Proposal not found")
    const input = body(init)
    const decided = rest[2] === "approve"
      ? { ...proposal, Status: "approved", DecidedAt: now, DecisionNote: input.Note ?? "", CatalogExerciseID: "ex-headers" }
      : { ...proposal, Status: "rejected", DecidedAt: now, DecisionNote: input.Note ?? "" }
    proposals = proposals.map((item) => item.ID === proposal.ID ? decided : item)
    return decided
  }

  const item = EXERCISES.find((candidate) => candidate.ID === rest[0])
  if (!item) throw new MockError(404, 30901, "Exercise not found")
  const card = () => ({ ...item, Permissions: permissionsFor(item, isAdmin) })
  if (rest.length === 1) {
    if (method === "PATCH") Object.assign(item, body(init))
    return card()
  }
  switch (rest[1]) {
    case "draft":
      if (method === "PUT") return { ...version(item.ID, "draft"), Variants: body(init).Variants ?? [] }
      return version(item.ID, item.HasDraft ? "draft" : "published")
    case "versions":
      if (rest[2]) return version(item.ID, "published")
      return [{ ID: `${item.ID}-pub`, Status: "published", AdminNote: "", Label: "", VariantCount: 2, CreatedAt: "2026-09-20T10:00:00Z", CreatedBy: "u-admin", PublishedAt: "2026-09-20T10:00:00Z" }]
    case "usage":
      return { Events: [] }
    case "access":
      Object.assign(item, { AccessLevel: body(init).AccessLevel, AccessEventIDs: body(init).EventIDs ?? [] })
      return card()
    case "proposals": {
      const created = { ID: `prop-${proposals.length + 1}`, ExerciseID: item.ID, ExerciseName: item.Name, EventID: item.OwnerEventID, EventName: item.OwnerEventName,
        Status: "pending", Note: body(init).Note ?? "", ProposedBy: "u-manager", ProposedByName: "Андрій Мельник", ProposedAt: now, DecidedAt: null, DecisionNote: "", CatalogExerciseID: null }
      proposals = [...proposals, created]
      item.PendingProposalID = created.ID
      return created
    }
    case "publish":
      Object.assign(item, { HasPublished: true, PublishedVersionID: `${item.ID}-pub-${Date.now()}`, HasChanges: false })
      return version(item.ID, "published")
    default:
      return card()
  }
}

/** Mirrors request() in api/client.ts: resolves with Data, rejects like ApiError. */
export async function mockRequest<T>(method: string, path: string, init: BodyInit | null | undefined, makeError: (status: number, code: number, message: string) => Error): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, 120))
  try {
    return route(method, path, init) as T
  } catch (error) {
    if (error instanceof MockError) throw makeError(error.status, error.code, error.message)
    throw error
  }
}
