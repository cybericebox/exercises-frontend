import { exercisePositionKey } from "@/lib/storageKeys"

/** The four views of the editor: one tab row, the variant dropdown sits between «Загальне» and the two variant tabs. */
export type EditorTab = "general" | "variants" | "tasks" | "infrastructure"
/** Sub-views of «Інфраструктура». */
export type InfraView = "diagram" | "devices" | "connections" | "vars"
/** Sections of the device editor dialog: Основне · Мережа · Ініціалізація · Сервіс · Доступ. */
export type DeviceSection = "main" | "network" | "init" | "service" | "access"

/** Where the editor was: tab, variant, task, infrastructure sub-view and device panel. Stored per user and exercise. */
export type EditorPosition = {
  tab: EditorTab
  variant: number
  task: number
  infraView: InfraView
  /** Device id (a gateway is a device too) whose editor dialog is open, "" = none. */
  openNode: string
  deviceSection: DeviceSection
  /** Open condition of a state check (index), -1 = none. */
  condition: number
  topologySection: string
  devicePanel: "basic" | "resources" | "interfaces" | "env" | "external"
  interface: number
  env: number
  scrollTop: number
}

export const DEFAULT_EDITOR_POSITION: EditorPosition = {
  tab: "general",
  variant: 0,
  task: 0,
  infraView: "diagram",
  openNode: "",
  deviceSection: "main",
  condition: -1,
  topologySection: "diagram",
  devicePanel: "basic",
  interface: 0,
  env: 0,
  scrollTop: 0,
}

export function editorPositionStorageKey(userId: string, exerciseId: string): string {
  return exercisePositionKey(userId, exerciseId)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function index(value: unknown): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0
}

const INFRA_VIEWS: readonly InfraView[] = ["diagram", "devices", "connections", "vars"]
const DEVICE_SECTIONS: readonly DeviceSection[] = ["main", "network", "init", "service", "access"]

/** Positions stored by the earlier editor (tab «variants» + section, tab «all») are mapped onto the new tabs. */
function tabOf(position: Record<string, unknown>): EditorTab {
  const { tab, section } = position
  if (tab === "general" || tab === "tasks" || tab === "infrastructure") return tab
  if (tab === "all") return "variants"
  if (tab === "variants") return section === "topology" ? "infrastructure" : "tasks"
  return "general"
}

export function normalizeEditorPosition(position: unknown): EditorPosition | null {
  if (!isRecord(position)) return null
  const panel = position.devicePanel
  const infraView = position.infraView as InfraView
  const deviceSection = position.deviceSection as DeviceSection
  return {
    tab: tabOf(position),
    variant: index(position.variant),
    task: index(position.task),
    infraView: INFRA_VIEWS.includes(infraView) ? infraView : "diagram",
    openNode: typeof position.openNode === "string" ? position.openNode : "",
    deviceSection: DEVICE_SECTIONS.includes(deviceSection) ? deviceSection : "main",
    condition: Number.isSafeInteger(position.condition) && Number(position.condition) >= -1 ? Number(position.condition) : -1,
    topologySection: typeof position.topologySection === "string" ? position.topologySection : "diagram",
    devicePanel: panel === "resources" || panel === "interfaces" || panel === "env" || panel === "external" ? panel : "basic",
    interface: index(position.interface),
    env: index(position.env),
    scrollTop: typeof position.scrollTop === "number" && Number.isFinite(position.scrollTop) && position.scrollTop >= 0 ? position.scrollTop : 0,
  }
}

export function parseEditorPosition(raw: string | null): EditorPosition | null {
  if (!raw) return null
  try { return normalizeEditorPosition(JSON.parse(raw) as unknown) } catch { return null }
}
