"use client"

import { ChevronDown } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { listArchiveImportTargets, type ImportTarget, type ImportTargetExercise } from "@/api/exercises/archiveImport"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadError } from "@/components/ui/load-error"
import { LoadingArea } from "@/components/ui/spinner"
import type { FieldControlProps } from "@/components/ui/form-field"
import { t } from "@/i18n/t"

export function importTargetContext(target: ImportTargetExercise) {
  return target.OwnerEventID ? target.OwnerEventName || target.OwnerEventTag : t("admin.exImport.targetCatalog")
}
export function ImportTargetPicker({ itemKey, selected, onChange, disabled, ...control }: Partial<FieldControlProps> & {
  itemKey: string; selected: ImportTargetExercise | null; disabled?: boolean
  onChange: (target: ImportTarget, exercise?: ImportTargetExercise) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [items, setItems] = useState<ImportTargetExercise[]>([])
  const [cursor, setCursor] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const request = useRef<AbortController | null>(null)
  async function load(next?: string, query = search) {
    request.current?.abort()
    const current = new AbortController(); request.current = current
    setBusy(true); setError(null)
    try {
      const page = await listArchiveImportTargets({ search: query, ...(next ? { cursor: next } : {}) }, current.signal)
      if (current.signal.aborted) return
      setItems(previous => next ? [...previous, ...(page.Items ?? [])] : page.Items ?? [])
      setCursor(page.NextCursor)
    } catch (cause) { if (!current.signal.aborted) setError(cause) }
    finally { if (!current.signal.aborted) setBusy(false) }
  }
  useEffect(() => () => request.current?.abort(), [])
  function changeOpen(next: boolean) {
    setOpen(next)
    if (next) void load()
    else request.current?.abort()
  }
  const choose = (target?: ImportTargetExercise) => {
    onChange({ ItemKey: itemKey, Mode: target ? "update" : "new", ...(target ? { ExerciseID: target.ID } : {}) }, target)
    setOpen(false)
  }
  return <Popover open={open} onOpenChange={changeOpen}>
    <PopoverTrigger asChild><Button {...control} type="button" variant="outline" disabled={disabled} className="exercise-import-target">
      <span><strong>{selected ? t("admin.exImport.update.targetName", { name: selected.Name }) : t("admin.exImport.update.new")}</strong>
        <small>{selected ? t("admin.exImport.update.updateContext", { owner: importTargetContext(selected) }) : t("admin.exImport.update.newHint")}</small></span><ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0" />
    </Button></PopoverTrigger>
    <PopoverContent className="exercise-import-picker" align="start">
      <Input autoFocus aria-label={t("admin.exImport.update.search")} placeholder={t("admin.exImport.update.search")} value={search} onChange={event => { setCursor(undefined); setItems([]); setSearch(event.target.value); void load(undefined, event.target.value) }} />
      <div className="exercise-import-picker-list">
        <button type="button" className="exercise-import-option" onClick={() => choose()}>{t("admin.exImport.update.new")}<small>{t("admin.exImport.update.newHint")}</small></button>
        <p className="exercise-import-picker-label">{t("admin.exImport.update.editable")}</p>
        {error ? <LoadError compact error={error} message={t("admin.exImport.update.targetsError")} onRetry={() => void load()} />
          : busy && !items.length ? <LoadingArea compact label={t("admin.exImport.update.searching")} />
          : !items.length ? <EmptyState compact message={t("admin.exImport.update.noTargets")} />
          : items.map(target => <button key={target.ID} type="button" className="exercise-import-option" aria-pressed={selected?.ID === target.ID} onClick={() => choose(target)}>{target.Name}{" "}<small>{importTargetContext(target)}</small></button>)}
        {cursor && <Button type="button" variant="ghost" busy={busy} busyLabel={t("admin.exImport.update.searching")} onClick={() => void load(cursor)}>{t("admin.exImport.update.more")}</Button>}
      </div>
    </PopoverContent>
  </Popover>
}
