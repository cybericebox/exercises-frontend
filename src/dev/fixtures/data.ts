/**
 * Canned data of the editor fixture mode (dev only, see ./install.ts). One rich exercise shaped like the approved mockup:
 * two variants (the second linked to the first), three subtasks (a text answer, a state check with five observation
 * kinds, a template flag with placeholders), devices r1 / r2 / srv with browser access, a hub and a switch, a variable
 * of the infrastructure and a secret environment variable with a stored value.
 *
 * Wire shape: PascalCase, the daemon contract of feat/hardening (docs/exercise-http-api-1.0.md).
 */
import type { ExerciseCapabilities, LabCapabilities, LabSupportValue } from "@/api/exercises/capabilities"

export const FIXTURE_EXERCISE_ID = "11111111-1111-4111-8111-111111111111"
export const FIXTURE_DRAFT_ID = "22222222-2222-4222-8222-222222222222"
export const FIXTURE_EVENT_ID = "33333333-3333-4333-8333-333333333333"
const V1 = "aaaaaaa1-0000-4000-8000-000000000001"
const V2 = "aaaaaaa2-0000-4000-8000-000000000002"
const T = (n: number) => `bbbbbbb${n}-0000-4000-8000-00000000000${n}`
const D = { r1: "ccccccc1-0000-4000-8000-000000000001", r2: "ccccccc2-0000-4000-8000-000000000002", srv: "ccccccc3-0000-4000-8000-000000000003", hub1: "ccccccc4-0000-4000-8000-000000000004", sw1: "ccccccc5-0000-4000-8000-000000000005" }
const NOW = "2026-11-12T09:00:00Z"

/** A minimal Lexical document with one paragraph per line; `{{ph_key}}` becomes a placeholder node, as the editor saves it. */
export function lexical(text: string) {
  const textNode = (value: string) => ({ detail: 0, format: 0, mode: "normal", style: "", text: value, type: "text", version: 1 })
  const inline = (line: string) => line.split(/(\{\{ph_[A-Za-z0-9_]+\}\})/).filter(Boolean).map((part) => {
    const token = /^\{\{(ph_[A-Za-z0-9_]+)\}\}$/.exec(part)
    return token ? { type: "variable", version: 1, varName: token[1] } : textNode(part)
  })
  const paragraph = (line: string) => ({ children: inline(line), direction: "ltr", format: "", indent: 0, type: "paragraph", version: 1 })
  return { root: { children: text.split("\n").map(paragraph), direction: "ltr", format: "", indent: 0, type: "root", version: 1 } }
}

const iface = (Name: string, IP: Record<string, unknown>) => ({ Name, IP })

function topology() {
  return {
    Variables: [{ Name: "admin_password", Template: "[a-z0-9]{12}" }, { Name: "app_title", Value: "Internal portal" }],
    VPN: { Enabled: true, DHCP: false, ReverseConnections: false },
    Internet: { Enabled: true, DHCP: false },
    Devices: [
      {
        ID: D.r1, Name: "r1", Type: "node", Profile: "container", Image: "platform/frr:9.1", SecurityPreset: "extended", ResourcePreset: "small",
        Interfaces: [iface("eth0", { Type: "static", AddressRef: { Network: "vpn", Host: 10 } }), iface("eth1", { Type: "none" })],
        Access: [{ Kind: "terminal", Command: "/bin/sh" }],
      },
      {
        ID: D.r2, Name: "r2", Type: "node", Profile: "container", Image: "platform/frr:9.1", SecurityPreset: "extended", ResourcePreset: "small",
        Interfaces: [iface("eth0", { Type: "static", Addresses: ["10.0.1.2/24"] }), iface("eth1", { Type: "static", Addresses: ["10.0.2.1/24"] }), iface("eth2", { Type: "none" })],
        Access: [{ Kind: "terminal", Command: "/bin/sh", User: "root" }],
        Bootstrap: { Timeout: "30s", Files: [{ Path: "/etc/frr/frr.conf", Content: "router ospf\n network 10.0.1.0/24 area 0\n", Owner: "frr", Mode: "0640" }] },
      },
      {
        ID: D.srv, Name: "srv", Type: "node", Profile: "container", Image: "platform/web:2.4", ResourcePreset: "small",
        Interfaces: [iface("eth0", { Type: "static", Addresses: ["10.0.2.10/24"], Gateway: "10.0.2.1" })],
        Access: [{ Kind: "http", Port: 80, Protocol: "http" }, { Kind: "terminal" }],
        Bootstrap: {
          Timeout: "1m",
          Env: [
            { Name: "APP_MODE", Value: "ctf", Secret: false },
            { Name: "LICENSE_KEY", Value: "", Secret: true, HasValue: true, ValueGroup: 1 },
            { Name: "FLAG", Value: "{{task.secret}}", Secret: false },
          ],
          Files: [{ Path: "/srv/secret/flag.txt", Content: "{{task.secret}}", Owner: "www-data", Mode: "0400" }],
          Script: 'echo "admin:{{var.admin_password}}" > /etc/app/users\n',
          Interpreter: "/bin/sh",
        },
        WaitReadyFile: true,
      },
      { ID: D.hub1, Name: "hub1", Type: "hub", Interfaces: [] },
      { ID: D.sw1, Name: "sw1", Type: "unmanaged-switch", Interfaces: [] },
    ],
    Connections: [
      { Endpoints: [{ Kind: "vpn", Interface: "eth0" }, { Kind: "device", DeviceID: D.r1, Interface: "eth0" }] },
      { Endpoints: [{ Kind: "device", DeviceID: D.r1, Interface: "eth1" }, { Kind: "device", DeviceID: D.r2, Interface: "eth0" }] },
      { Endpoints: [{ Kind: "device", DeviceID: D.r2, Interface: "eth1" }, { Kind: "device", DeviceID: D.srv, Interface: "eth0" }] },
      { Endpoints: [{ Kind: "device", DeviceID: D.r2, Interface: "eth2" }, { Kind: "device", DeviceID: D.hub1, Interface: "GigabitEthernet0/1" }] },
      { Endpoints: [{ Kind: "device", DeviceID: D.hub1, Interface: "GigabitEthernet0/2" }, { Kind: "device", DeviceID: D.sw1, Interface: "GigabitEthernet0/1" }] },
      { Endpoints: [{ Kind: "device", DeviceID: D.sw1, Interface: "GigabitEthernet0/2" }, { Kind: "internet", Interface: "eth0" }] },
    ],
    VisualRender: { icons: { [D.r1]: "router", [D.r2]: "router" }, positions: { vpn: { x: 0.08, y: 0.2 }, [D.r1]: { x: 0.26, y: 0.2 }, [D.r2]: { x: 0.44, y: 0.2 }, [D.srv]: { x: 0.62, y: 0.2 }, [D.hub1]: { x: 0.44, y: 0.55 }, [D.sw1]: { x: 0.62, y: 0.55 }, internet: { x: 0.62, y: 0.85 } } },
  }
}

function tasks(second: boolean) {
  const own = (answer: string, file: string) => ({ Check: { Answer: { Type: "flag", Values: [answer] } }, Attachments: [{ FileID: `f-${file}`, Name: "notes.txt", ContentHash: file }] })
  return [
    {
      ID: T(1), Key: "theory", Name: "Протокол маршрутизації", Difficulty: "elementary", Requires: [],
      Description: lexical("Який протокол стану каналу використовує алгоритм Дейкстри?"),
      Check: { Answer: { Type: "text", Values: [second ? "OSPFv2" : "OSPF"], IgnoreCase: true, InputHint: "Назва протоколу" } },
      Attachments: [], Placeholders: [],
      Hints: [{ ID: "h1", Text: "Назва протоколу починається на O і розшифровується як Open Shortest Path First.", Level: "direction" }],
    },
    {
      ID: T(2), Key: "ospf", Name: "Налаштуйте OSPF", Difficulty: "medium", Requires: ["theory"],
      Description: lexical("Налаштуйте OSPF на маршрутизаторі r1 так, щоб він встановив сусідство з r2.\nВикористайте область 0 і збережіть конфігурацію."),
      Check: {
        State: {
          Mode: "once", Interval: "30s", Manual: true,
          Conditions: [
            { DeviceID: D.r1, Timeout: "10s", Custom: { Run: "vtysh -c 'show ip ospf neighbor' | grep -q Full", Interpreter: "/bin/sh" } },
            { DeviceID: D.r1, File: { Path: "/etc/frr/frr.conf", Contains: "router ospf", Exists: true } },
            { DeviceID: D.r2, Port: { Port: 2604, Protocol: "tcp", Listening: true } },
            { DeviceID: D.srv, Request: { Protocol: "http", Port: 80, Method: "GET", Path: "/", Status: 200 } },
            { DeviceID: D.r1, Process: { Name: "ospfd", Running: true } },
          ],
        },
      },
      Attachments: [], Placeholders: [],
      Hints: [
        { ID: "h2", Text: "Команди конфігурації вводяться через vtysh.", Level: "nudge" },
        { ID: "h3", Text: "Увімкніть процес командою router ospf, потім додайте мережу з областю 0.", Level: "steps" },
      ],
    },
    {
      ID: T(3), Key: "secret", Name: "Знайдіть прапор", Difficulty: "easy", Requires: ["ospf"],
      Description: lexical("Після налаштування мережі сервіс на {{ph_srv}} стане доступним. Знайдіть прапор."),
      Check: second ? own("ICE{b7d2e4f19a03c58d}", "b").Check : { Answer: { Type: "flag", Values: ["template:ICE{[a-f0-9]{16}}"], InputHint: "ICE{…}" } },
      Attachments: second ? own("", "b").Attachments : [{ FileID: "f-a", Name: "notes.txt", ContentHash: "a" }],
      Placeholders: [
        { Key: "ph_srv", Kind: "ip", IPReference: "static", Octets1to3: "10.0.2", LastOctet: 10, ShowMask: false },
        { Key: "ph_web", Kind: "external.link", DeviceName: "srv", Access: "http" },
      ],
      Hints: [],
    },
  ]
}

export type DraftShape = "rich" | "needless"

/** `needless`: the linked variant differs only by an answer that reaches the lab (no files, no images), so the list says variants are not needed. */
function variantTwo(shape: DraftShape) {
  const second = tasks(true)
  if (shape === "needless") second[2].Attachments = []
  return second
}

export function buildDraft(shape: DraftShape = "rich") {
  const first = tasks(false)
  // `needless`: the only answer left reaches the lab, so no variant needs its own answers (the first subtask is a state check).
  const stateOnly = (list: ReturnType<typeof tasks>) => { if (shape === "needless") list[0].Check = { State: { Mode: "once", Interval: "", Manual: false, Conditions: [] } } as unknown as typeof list[0]["Check"]; return list }
  return {
    ID: FIXTURE_DRAFT_ID, ExerciseID: FIXTURE_EXERCISE_ID, Status: "draft", Label: "",
    Name: "Маршрутизація і сервіс", Description: "Налаштування динамічної маршрутизації між двома маршрутизаторами та пошук прихованого сервісу за ними.", Tags: ["network", "academy"],
    AdminNote: "Образ frr зібрано з FRR 9.1. Перевірити ліміт часу скрипта на r2 перед публікацією.",
    Variants: [
      { ID: V1, Index: 1, Note: "Основний варіант", Weight: 2, Tasks: stateOnly(first), Topology: topology() },
      { ID: V2, Index: 2, Note: "Варіант Б: інший прапор і файл", Weight: 1, LinkedTo: V1, Tasks: stateOnly(variantTwo(shape)), Topology: topology() },
    ],
    Resources: {
      Min: { CPUMillicores: 750, MemoryBytes: 805306368, Devices: 3, Blocks: 3 }, Max: { CPUMillicores: 750, MemoryBytes: 805306368, Devices: 3, Blocks: 3 },
      Variants: [{ VariantID: V1, CPUMillicores: 750, MemoryBytes: 805306368, Devices: 3, Blocks: 3 }, { VariantID: V2, CPUMillicores: 750, MemoryBytes: 805306368, Devices: 3, Blocks: 3 }],
      SpreadPercent: 0, VariantsDiffer: false, Outside: [], ResourceHeavy: false,
    },
    Elevation: null, CreatedAt: NOW, CreatedBy: "u-fixture", AuthorName: "Тест Автор", PublishedAt: null,
  }
}

export function buildExercise() {
  return {
    ID: FIXTURE_EXERCISE_ID, Name: "Маршрутизація і сервіс", Description: "Налаштування динамічної маршрутизації між двома маршрутизаторами та пошук прихованого сервісу за ними.",
    Tags: ["network", "academy"], DraftVersionID: FIXTURE_DRAFT_ID, PublishedVersionID: null, ArchivedAt: null, HasChanges: true,
    CreatedAt: NOW, CreatedBy: "u-fixture", AuthorName: "Тест Автор", UpdatedAt: NOW, UpdatedBy: "u-fixture", UpdatedByName: "Тест Автор",
    Scope: "catalog", OwnerEventID: null, OwnerEventName: "", OwnerEvent: null, AccessLevel: "all", AccessEventIDs: [], AccessEvents: [],
    OriginEventID: null, ForkedFrom: null, Infrastructure: true, UsesConsole: true, ResourceHeavy: false, PendingProposalID: null,
    Permissions: { CanRead: true, CanEdit: true, CanPublish: true, CanDelete: true, CanManageAccess: true, CanPropose: false, CanExport: true },
  }
}

export function buildListItem() {
  const e = buildExercise()
  return { ...e, HasDraft: true, Status: "draft_only", AvgDifficulty: 3, TaskCount: 3, TaskNames: tasks(false).map((task) => task.Name), VariantCount: 2 }
}

export const FIXTURE_ME = { ID: "u-fixture", FirstName: "Тест", LastName: "Автор", Email: "author@example.test", Role: "super_admin", Permissions: ["*"] }

export const FIXTURE_ACCESS = {
  IsAdmin: true, CanCreateCatalog: true, CanPublish: true, CanDelete: true, CanExport: true, CanImport: true,
  Events: [{ ID: FIXTURE_EVENT_ID, Name: "Весняний захід", Tag: "spring", CanWrite: true, InfrastructureAllowed: true }],
}

/** The lab states the page can be started in: `?labs=all|some|none|unknown|mixed` (default mixed). */
export type LabsMode = "all" | "some" | "none" | "unknown" | "mixed"

export function buildLabCapabilities(mode: LabsMode): LabCapabilities {
  const same = (value: LabSupportValue): LabCapabilities => ({
    Known: value !== "unknown",
    Observations: { file: value, directory: value, process: value, port: value, kernel_param: value, request: value, permission: value, custom: value, "file.type": value, "file.checksum": value },
    Access: { http: value, terminal: value, vnc: "none", rdp: "none" },
    Profiles: { container: value, microvm: value, vm: value },
    Bootstrap: value, Checks: value, VPNReverse: value,
  })
  if (mode === "mixed") {
    const caps = same("all")
    return {
      ...caps,
      Observations: { ...caps.Observations, process: "some", port: "none", kernel_param: "none", "file.type": "none", "file.checksum": "unknown" },
      Access: { http: "all", terminal: "some", vnc: "none", rdp: "none" },
      Profiles: { container: "all", microvm: "none", vm: "some" },
      VPNReverse: "some",
    }
  }
  return same(mode)
}

export function buildCapabilities(mode: LabsMode): ExerciseCapabilities {
  return {
    Laboratories: true, MaxActiveTestDeploys: 2, DevicePersistence: true, LabCapabilities: buildLabCapabilities(mode),
    Resources: {
      Block: { CPUMillicores: 250, MemoryBytes: 268435456 },
      Presets: [
        { ID: "small", Blocks: 1, CPUMillicores: 250, MemoryBytes: 268435456 },
        { ID: "medium", Blocks: 2, CPUMillicores: 500, MemoryBytes: 536870912 },
        { ID: "large", Blocks: 4, CPUMillicores: 1000, MemoryBytes: 1073741824 },
      ],
      DefaultPreset: "small", FrameBlocks: 6, CeilingBlocks: 12,
      Frame: { CPUMillicores: 1500, MemoryBytes: 1610612736 }, Ceiling: { CPUMillicores: 3000, MemoryBytes: 3221225472 },
      MaxDevicesPerLab: 16, MaxInterfacesPerDevice: 8, MaxPortsPerSwitch: 48, VariantSpreadWarnPercent: 25,
    },
  }
}

export const FIXTURE_IMAGE_SERVICES = (images: string[]) => images.map((Image, index) => index % 3 === 2
  ? { Image, Known: false, Entrypoint: [], Cmd: [], User: "", WorkingDir: "" }
  : { Image, Known: true, Entrypoint: ["/usr/lib/frr/docker-start"], Cmd: ["/usr/lib/frr/watchfrr.sh"], User: "frr", WorkingDir: "/" })

export type ImportKind = "update" | "new" | "blocked"

/** An import preview with a problem, a warning and a diff, to see the report. `new`: the document has no exercise id, everything is added; `blocked`: events that would lose answered tasks. */
export function buildImportPreview(kind: ImportKind = "update") {
  const preview = buildUpdatePreview()
  const item = preview.Items[0]
  if (kind === "new") {
    item.SuggestedTarget = { ItemKey: "item-1", Mode: "new" } as typeof item.SuggestedTarget
    item.Target = { ItemKey: "item-1", Mode: "new" } as typeof item.Target
    item.TargetExercise = null as unknown as typeof item.TargetExercise
    item.SourceExerciseID = null as unknown as string
    item.ReplacesDraft = false
    item.Report = {
      Diff: { Variants: [
        { Status: "added", Position: 1, StoredPosition: 0, Tasks: { Kept: [], Added: [{ Name: "Протокол маршрутизації", Key: "theory" }, { Name: "Налаштуйте OSPF", Key: "ospf" }], Removed: [] }, Devices: { Kept: [], Added: [{ Name: "r1" }, { Name: "r2" }], Removed: [] } },
        { Status: "added", Position: 2, StoredPosition: 0, Tasks: { Kept: [], Added: [{ Name: "Знайдіть прапор", Key: "secret" }], Removed: [] }, Devices: { Kept: [], Added: [{ Name: "srv" }], Removed: [] } },
      ] },
      Issues: [], Publishable: true, Warnings: [{ Code: "no_exercise_id" }], Usage: { Events: [], TestDeploys: 0 },
    } as unknown as typeof item.Report
  }
  if (kind === "blocked") {
    item.Report.Usage = { Events: [
      { EventID: FIXTURE_EVENT_ID, Name: "Весняний захід", Archived: false, VersionPublished: true, RunningLabs: 2, Removed: [{ Name: "Налаштуйте OSPF", Attempts: 12, Solves: 4 }], Added: [], VariantMissing: false, Blocked: true },
      { EventID: "44444444-4444-4444-8444-444444444444", Name: "Минулорічний захід", Archived: true, VersionPublished: false, RunningLabs: 0, Removed: [], Added: [], VariantMissing: true, Blocked: true },
    ], TestDeploys: 0 } as unknown as typeof item.Report.Usage
    item.Report.Warnings = [{ Code: "removed_task_has_attempts", Context: { event: "Весняний захід", task: "Налаштуйте OSPF", attempts: 12, solves: 4 } }, { Code: "used_by_events", Context: { events: 2 } }] as unknown as typeof item.Report.Warnings
  }
  return preview
}

function buildUpdatePreview() {
  return {
    Items: [{
      ItemKey: "item-1", SourceExerciseID: FIXTURE_EXERCISE_ID, Name: "Маршрутизація і сервіс", SourceVersion: { Position: 1, Status: "published" },
      SuggestedTarget: { ItemKey: "item-1", Mode: "update", ExerciseID: FIXTURE_EXERCISE_ID }, Target: { ItemKey: "item-1", Mode: "update", ExerciseID: FIXTURE_EXERCISE_ID },
      TargetExercise: { ID: FIXTURE_EXERCISE_ID, Name: "Маршрутизація і сервіс", Scope: "catalog", OwnerEventID: null, OwnerEventName: "", OwnerEventTag: "", HasDraft: true },
      SourceIDMismatch: false, ConfirmationRevision: "rev-1", ReplacesDraft: true,
      Summary: { Variants: { Added: 1, Removed: 0, Changed: 1 }, Subtasks: { Before: 3, After: 4 }, FlagsChanged: 1, Files: { Added: 1, Removed: 0 }, Images: { New: 0, Reused: 3 }, MetadataChanged: true },
      Report: {
        Diff: {
          Variants: [
            { Status: "kept", Position: 1, StoredPosition: 1, MatchedBy: "id", Tasks: { Kept: [{ Name: "Налаштуйте OSPF", Key: "ospf", MatchedBy: "key" }], Added: [{ Name: "Нове підзавдання", Key: "extra" }], Removed: [] }, Devices: { Kept: [{ Name: "r1" }, { Name: "r2" }], Added: [{ Name: "srv2" }], Removed: [] } },
            { Status: "added", Position: 3, StoredPosition: 0, Tasks: { Kept: [], Added: [{ Name: "Знайдіть прапор", Key: "secret" }], Removed: [] }, Devices: { Kept: [], Added: [{ Name: "srv" }], Removed: [] } },
          ],
        },
        Issues: [{ Code: 23513, Message: "state check in an event exercise", Path: "versions[0].variants[0].tasks[1].check" }],
        Publishable: false,
        Warnings: [{ Code: "used_by_events", Context: { events: 1 } }, { Code: "running_labs", Context: { labs: 2 } }],
        Usage: { Events: [{ EventID: FIXTURE_EVENT_ID, Name: "Весняний захід", Archived: false, VersionPublished: true, RunningLabs: 2, Removed: [], Added: [{ Name: "Нове підзавдання" }], VariantMissing: false, Blocked: false }], TestDeploys: 1 },
      },
    }],
  }
}

/** A test deploy walks through its phases by the time since it started (`?deploy=fail` ends it in Failed). */
export function buildDeployStatus(startedAt: number, now: number, fail: boolean) {
  const s = (now - startedAt) / 1000
  const device = (Name: string, ready: boolean, extra: Record<string, unknown> = {}) => ({ Name, Ready: ready, ...extra })
  const base = { VPNCIDR: "10.200.0.0/24", InternetCIDR: "10.201.0.0/24", ReverseConnections: false, VPNReverse: "blocked", ExpiresAt: new Date(startedAt + 3_600_000).toISOString() }
  if (s < 3) return { ...base, Phase: "Queued", Ready: false, Queue: { Position: 2, Length: 3, Reason: "WaitingForTurn", Message: "", Pods: 3, Pending: 3 }, Devices: [] }
  if (s < 7) return { ...base, Phase: "Provisioning", Ready: false, Devices: [device("r1", s > 5), device("r2", false), device("srv", false)] }
  if (fail) return { ...base, Phase: "Failed", Ready: false, Devices: [device("r1", true), device("r2", true), device("srv", false, { Reason: "bootstrap failed", Bootstrap: { Phase: "failed", Attempts: 3, Reason: "script exited with 1" } })] }
  if (s < 11) return { ...base, Phase: "Provisioning", Ready: false, Devices: [device("r1", true), device("r2", true), device("srv", false, { Bootstrap: { Phase: "pending", Attempts: 1, Reason: "" } })] }
  const passedAt = s > 20 ? new Date(startedAt + 20_000).toISOString() : null
  const check = (ID: string, passed: boolean) => ({ ID, Known: true, Passed: passed, FirstPassedAt: passed ? passedAt : null, ChangedAt: passedAt, Value: passed ? "ok" : "", Detail: passed ? "" : "not yet" })
  const checks = [check("ospf:1", s > 14), check("ospf:2", s > 17), check("ospf:3", s > 20), check("ospf:4", true), check("ospf:5", true)]
  const solved = checks.every((item) => item.Passed)
  return {
    ...base, Phase: "Ready", Ready: true,
    VPNConfig: "[Interface]\nPrivateKey = fixture\nAddress = 10.200.0.2/32\n", VPNConnected: s > 25, VPNProbeURL: "https://probe.example.test/",
    Devices: [device("r1", true, { Bootstrap: null }), device("r2", true, { Bootstrap: { Phase: "done", Attempts: 1, Reason: "" } }), device("srv", true, { Bootstrap: { Phase: "done", Attempts: 1, Reason: "" } })],
    Access: [{ Device: "srv", Port: 80, Protocol: "http", URL: "http://10.0.2.10/" }],
    SolvedTaskIDs: solved ? [T(2)] : [],
    StateTasks: [{ TaskID: T(2), Key: "ospf", Mode: "once", Manual: true, Solved: solved, SolvedAt: solved ? passedAt : null, FirstSolvedAt: solved ? passedAt : null, Known: true, Checks: checks }],
  }
}

export const FIXTURE_IDS = { V1, V2, T, D }
