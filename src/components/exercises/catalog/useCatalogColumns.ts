"use client"

import { useCallback, useState } from "react"
import { DEFAULT_COLUMNS, normalizeColumns, type ColumnSetting } from "@/lib/catalogColumns"
import { STORAGE_CATALOG_COLUMNS } from "@/lib/storageKeys"

function read(): ColumnSetting[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_CATALOG_COLUMNS)
    return raw ? normalizeColumns(JSON.parse(raw)) : DEFAULT_COLUMNS.map((column) => ({ ...column }))
  } catch {
    return DEFAULT_COLUMNS.map((column) => ({ ...column }))
  }
}

/** The catalog columns of this user: shown at once, saved without waiting (a failed save keeps the choice on screen). */
export function useCatalogColumns(): [ColumnSetting[], (next: ColumnSetting[]) => void] {
  const [columns, setColumns] = useState<ColumnSetting[]>(() => (typeof window === "undefined" ? DEFAULT_COLUMNS : read()))
  const update = useCallback((next: ColumnSetting[]) => {
    setColumns(next)
    try { window.localStorage.setItem(STORAGE_CATALOG_COLUMNS, JSON.stringify(next)) } catch { /* private mode: the choice lasts for this page */ }
  }, [])
  return [columns, update]
}
