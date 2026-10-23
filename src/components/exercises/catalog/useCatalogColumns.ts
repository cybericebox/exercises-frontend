"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { getCatalogColumns, saveCatalogColumns } from "@/api/exercises/catalog"
import { toast } from "@/components/ui/toast"
import { t } from "@/i18n/t"
import {
  DEFAULT_LAYOUT, layoutToStored, normalizeLayout, withLocalWidths, withWidth,
  NAME_COLUMN, type CatalogColumn, type CatalogLayout, type ColumnSetting,
} from "@/lib/catalogColumns"
import { STORAGE_CATALOG_COLUMNS } from "@/lib/storageKeys"

function readLocal(): CatalogLayout | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_CATALOG_COLUMNS)
    return raw ? normalizeLayout(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function writeLocal(layout: CatalogLayout) {
  try { window.localStorage.setItem(STORAGE_CATALOG_COLUMNS, JSON.stringify(layoutToStored(layout))) } catch { /* private mode: the profile still has them */ }
}

export type CatalogColumnsState = {
  layout: CatalogLayout
  setColumns: (columns: ColumnSetting[]) => void
  /** A column's width in px, or `undefined` back to its default. */
  setWidth: (key: CatalogColumn | typeof NAME_COLUMN, width: number | undefined) => void
  /** Default order, visibility and widths. */
  reset: () => void
}

/**
 * The catalog columns of this user (order, visibility, widths), kept in their profile on the server. The browser's
 * copy shows at once; the profile's answer replaces it unless the user already changed something meanwhile (widths
 * the profile does not carry are kept from the browser). A change shows at once and is saved through a queue, so
 * quick changes never race and nothing waits for the server; a failed save keeps the choice on screen (and in this
 * browser) and says so.
 */
export function useCatalogColumns(): CatalogColumnsState {
  const [layout, setLayout] = useState<CatalogLayout>(() => (typeof window === "undefined" ? DEFAULT_LAYOUT : readLocal() ?? DEFAULT_LAYOUT))
  const latest = useRef(layout)
  const changed = useRef(false)
  const queue = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    let active = true
    getCatalogColumns().then((stored) => {
      if (!active || changed.current || stored === null) return
      const next = withLocalWidths(normalizeLayout(stored), readLocal())
      latest.current = next
      setLayout(next)
      writeLocal(next)
    }).catch(() => undefined)
    return () => { active = false }
  }, [])

  const commit = useCallback((next: CatalogLayout) => {
    changed.current = true
    latest.current = next
    setLayout(next)
    writeLocal(next)
    const stored = layoutToStored(next)
    queue.current = queue.current.then(() => saveCatalogColumns(stored)).catch(() => { toast.error(t("exercises.catalog.columnsSaveError")) })
  }, [])

  const setColumns = useCallback((columns: ColumnSetting[]) => commit({ ...latest.current, columns }), [commit])
  const setWidth = useCallback((key: CatalogColumn | typeof NAME_COLUMN, width: number | undefined) => commit(withWidth(latest.current, key, width)), [commit])
  const reset = useCallback(() => commit({ columns: DEFAULT_LAYOUT.columns.map((column) => ({ ...column })) }), [commit])
  return { layout, setColumns, setWidth, reset }
}
