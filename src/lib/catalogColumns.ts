/**
 * catalogColumns.ts — the catalog table's own columns: which show and in what order (the name is always first).
 * Every user arranges them once; the setting is a plain list, so storage (the profile on the server, the browser
 * until then) never needs to know the columns. Nothing here mutates its input.
 */

export const CATALOG_COLUMNS = ["access", "status", "subtasks", "variants", "author", "updated", "difficulty", "tags", "owner"] as const
export type CatalogColumn = (typeof CATALOG_COLUMNS)[number]

/** A column: shown or hidden, in the list's order, and its own width in px (absent = the default width). */
export type ColumnSetting = { key: CatalogColumn; visible: boolean; width?: number }

/** The column layout of the catalog table: the columns and the width the user gave «Назва» (absent = default). */
export type CatalogLayout = { columns: ColumnSetting[]; nameWidth?: number }

/** «Назва» is not in the list (always first); in the stored list its width rides on an entry with this key. */
export const NAME_COLUMN = "name"

/** Default widths in px; «Назва» takes at least its width and any space the others leave. */
export const COLUMN_WIDTH: Record<CatalogColumn, number> = { access: 190, status: 140, subtasks: 134, variants: 112, author: 160, updated: 124, difficulty: 160, tags: 200, owner: 190 }
export const NAME_WIDTH = 240
export const NAME_MIN_WIDTH = 200
export const NAME_MAX_WIDTH = 900
export const MIN_WIDTH = 80
export const MAX_WIDTH = 600

/** A width brought inside the column's bounds (whole px). */
export function clampWidth(key: CatalogColumn | typeof NAME_COLUMN, width: number): number {
  const [min, max] = key === NAME_COLUMN ? [NAME_MIN_WIDTH, NAME_MAX_WIDTH] : [MIN_WIDTH, MAX_WIDTH]
  return Math.round(Math.min(max, Math.max(min, width)))
}

function storedWidth(key: CatalogColumn | typeof NAME_COLUMN, raw: unknown): number | undefined {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? clampWidth(key, raw) : undefined
}

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
    const width = storedWidth(key, (item as { width?: unknown }).width)
    list.push({ key, visible: Boolean((item as { visible?: unknown }).visible), ...(width ? { width } : {}) })
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

/** A stored list made whole as a layout: the columns (normalizeColumns) and the «Назва» width of its name entry. */
export function normalizeLayout(raw: unknown): CatalogLayout {
  const name = Array.isArray(raw) ? raw.find((item) => (item as { key?: unknown } | null)?.key === NAME_COLUMN) as { width?: unknown } | undefined : undefined
  const nameWidth = storedWidth(NAME_COLUMN, name?.width)
  return { columns: normalizeColumns(raw), ...(nameWidth ? { nameWidth } : {}) }
}

/** The layout as the stored list: the name entry (only with a width) first, then the columns. */
export function layoutToStored(layout: CatalogLayout): { key: string; visible: boolean; width?: number }[] {
  return [
    ...(layout.nameWidth ? [{ key: NAME_COLUMN, visible: true, width: layout.nameWidth }] : []),
    ...layout.columns.map(({ key, visible, width }) => (width ? { key, visible, width } : { key, visible })),
  ]
}

/** The layout with one column's width set (clamped) or, with `undefined`, back to its default. */
export function withWidth(layout: CatalogLayout, key: CatalogColumn | typeof NAME_COLUMN, width: number | undefined): CatalogLayout {
  const value = width === undefined ? undefined : clampWidth(key, width)
  if (key === NAME_COLUMN) {
    const { nameWidth: _old, ...rest } = layout
    void _old
    return value ? { ...rest, nameWidth: value } : rest
  }
  return { ...layout, columns: layout.columns.map((column) => {
    if (column.key !== key) return column
    const { width: _width, ...plain } = column
    void _width
    return value ? { ...plain, width: value } : plain
  }) }
}

/**
 * The profile's layout with the widths it does not carry taken from this browser's copy. (The profile service may
 * not keep widths yet; then they live in the browser only, and the profile keeps order and visibility.)
 */
export function withLocalWidths(server: CatalogLayout, local: CatalogLayout | null): CatalogLayout {
  if (!local) return server
  const localWidth = new Map(local.columns.map((column) => [column.key, column.width]))
  const nameWidth = server.nameWidth ?? local.nameWidth
  return {
    columns: server.columns.map((column) => {
      const width = column.width ?? localWidth.get(column.key)
      return width ? { ...column, width } : column
    }),
    ...(nameWidth ? { nameWidth } : {}),
  }
}

/** Whether the layout is the default one: default order and visibility, and no width set. */
export function isDefaultLayout(layout: CatalogLayout): boolean {
  return isDefaultColumns(layout.columns) && !layout.nameWidth && layout.columns.every((column) => !column.width)
}

export const DEFAULT_LAYOUT: CatalogLayout = { columns: DEFAULT_COLUMNS }
