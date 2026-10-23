/**
 * catalogColumns.ts — the catalog table's own columns: which show and in what order (the name is always first).
 * Every user arranges them once; the setting is a plain list, so storage (the profile on the server, the browser
 * until then) never needs to know the columns. Nothing here mutates its input.
 */

export const CATALOG_COLUMNS = ["access", "status", "subtasks", "variants", "author", "updated", "difficulty", "tags", "owner"] as const
export type CatalogColumn = (typeof CATALOG_COLUMNS)[number]

export type ColumnSetting = { key: CatalogColumn; visible: boolean }

const HIDDEN_BY_DEFAULT: CatalogColumn[] = ["difficulty", "tags", "owner"]

export const DEFAULT_COLUMNS: ColumnSetting[] = CATALOG_COLUMNS.map((key) => ({ key, visible: !HIDDEN_BY_DEFAULT.includes(key) }))

/** The server field a column sorts by; a column without one is not sortable. */
export const COLUMN_SORT: Partial<Record<CatalogColumn, string>> = {
  status: "status", subtasks: "subtasks", variants: "variants", author: "author", updated: "updated", difficulty: "difficulty", tags: "tags",
}

function isColumn(value: unknown): value is CatalogColumn {
  return typeof value === "string" && (CATALOG_COLUMNS as readonly string[]).includes(value)
}

/**
 * A stored setting made whole: unknown and repeated columns are dropped, the saved order is kept, and a column the
 * setting does not know yet (added in a later release) joins at the end with its default visibility.
 */
export function normalizeColumns(raw: unknown): ColumnSetting[] {
  if (!Array.isArray(raw)) return DEFAULT_COLUMNS.map((column) => ({ ...column }))
  const seen = new Set<CatalogColumn>()
  const list: ColumnSetting[] = []
  for (const item of raw) {
    const key = (item as { key?: unknown } | null)?.key
    if (!isColumn(key) || seen.has(key)) continue
    seen.add(key)
    list.push({ key, visible: Boolean((item as { visible?: unknown }).visible) })
  }
  for (const column of DEFAULT_COLUMNS) if (!seen.has(column.key)) list.push({ ...column })
  return list
}

/** The list with one column moved to another position (clamped to the list). */
export function moveColumn(columns: ColumnSetting[], from: number, to: number): ColumnSetting[] {
  const target = Math.max(0, Math.min(columns.length - 1, to))
  if (from === target || from < 0 || from >= columns.length) return columns
  const next = [...columns]
  const [moved] = next.splice(from, 1)
  next.splice(target, 0, moved)
  return next
}

/** The list with one column shown or hidden. */
export function toggleColumn(columns: ColumnSetting[], key: CatalogColumn): ColumnSetting[] {
  return columns.map((column) => (column.key === key ? { ...column, visible: !column.visible } : column))
}

/** Whether the setting is the default one (the «Скинути» action is offered only otherwise). */
export function isDefaultColumns(columns: ColumnSetting[]): boolean {
  return columns.length === DEFAULT_COLUMNS.length && columns.every((column, index) => column.key === DEFAULT_COLUMNS[index].key && column.visible === DEFAULT_COLUMNS[index].visible)
}
