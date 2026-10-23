"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { getCatalogColumns, saveCatalogColumns } from "@/api/exercises/catalog"
import { toast } from "@/components/ui/toast"
import { t } from "@/i18n/t"
import { DEFAULT_COLUMNS, normalizeColumns, type ColumnSetting } from "@/lib/catalogColumns"
import { STORAGE_CATALOG_COLUMNS } from "@/lib/storageKeys"

function readLocal(): ColumnSetting[] | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_CATALOG_COLUMNS)
    return raw ? normalizeColumns(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function writeLocal(columns: ColumnSetting[]) {
  try { window.localStorage.setItem(STORAGE_CATALOG_COLUMNS, JSON.stringify(columns)) } catch { /* private mode: the profile still has them */ }
}

/**
 * The catalog columns of this user, kept in their profile on the server. The browser's copy shows at once; the
 * profile's answer replaces it unless the user already changed something meanwhile. A change shows at once and is
 * saved through a queue, so quick changes never race and nothing waits for the server; a failed save keeps the
 * choice on screen (and in this browser) and says so.
 */
export function useCatalogColumns(): [ColumnSetting[], (next: ColumnSetting[]) => void] {
  const [columns, setColumns] = useState<ColumnSetting[]>(() => (typeof window === "undefined" ? DEFAULT_COLUMNS : readLocal() ?? DEFAULT_COLUMNS))
  const changed = useRef(false)
  const queue = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    let active = true
    getCatalogColumns().then((stored) => {
      if (!active || changed.current || stored === null) return
      const next = normalizeColumns(stored)
      setColumns(next)
      writeLocal(next)
    }).catch(() => undefined)
    return () => { active = false }
  }, [])

  const update = useCallback((next: ColumnSetting[]) => {
    changed.current = true
    setColumns(next)
    writeLocal(next)
    queue.current = queue.current.then(() => saveCatalogColumns(next)).catch(() => { toast.error(t("exercises.catalog.columnsSaveError")) })
  }, [])
  return [columns, update]
}
