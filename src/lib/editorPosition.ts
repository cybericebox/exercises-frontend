/** Where the editor was: tab, variant, section, task, device panel. Stored per user and exercise. */
export type EditorPosition = {
  tab: "general" | "variants"
  variant: number
  section: "tasks" | "topology"
  task: number
  topologySection: string
  devicePanel: "basic" | "resources" | "interfaces" | "env" | "external"
  interface: number
  env: number
  scrollTop: number
}

export const DEFAULT_EDITOR_POSITION: EditorPosition = {
  tab: "general",
  variant: 0,
  section: "tasks",
  task: 0,
  topologySection: "diagram",
  devicePanel: "basic",
  interface: 0,
  env: 0,
  scrollTop: 0,
}

export function editorPositionStorageKey(userId: string, exerciseId: string): string {
  return `cybericebox.admin.exercise-position.v1:${userId}:${exerciseId}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function index(value: unknown): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0
}

export function normalizeEditorPosition(position: unknown): EditorPosition | null {
  if (!isRecord(position)) return null
  const panel = position.devicePanel
  return {
    tab: position.tab === "variants" ? "variants" : "general",
    variant: index(position.variant),
    section: position.section === "topology" ? "topology" : "tasks",
    task: index(position.task),
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
