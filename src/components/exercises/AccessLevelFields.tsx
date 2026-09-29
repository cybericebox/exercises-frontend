"use client"

import { useEffect, useMemo, useState } from "react"
import { getEventOption, listEventOptions, listNearestEvents, type EventOption } from "@/api/events/list"
import type { AccessLevel } from "@/api/exercises/catalog"
import { Input } from "@/components/ui/input"
import { LoadingArea } from "@/components/ui/spinner"
import { EmptyState } from "@/components/ui/empty-state"
import { t } from "@/i18n/t"

export type AccessChoice = Exclude<AccessLevel, "">

export type AccessValue = { level: AccessChoice; eventIds: string[] }

export function accessValueValid(value: AccessValue): boolean {
  return value.level !== "selected" || value.eventIds.length > 0
}

const SEARCH_LIMIT = 20

/**
 * Access level radios and, for «selected», an event picker: the nearest few
 * events by default, others through server search. Selected events stay
 * pinned on top. The list block has a fixed height and loads inside it, so
 * the dialog never shifts; events are prefetched when the fields mount.
 */
export function AccessLevelFields({ value, onChange, allowOwn, originEventName, disabled }: {
  value: AccessValue
  onChange: (value: AccessValue) => void
  allowOwn: boolean
  originEventName?: string
  disabled?: boolean
}) {
  const [nearest, setNearest] = useState<EventOption[] | null>(null)
  const [known, setKnown] = useState<Record<string, EventOption>>({})
  const [failed, setFailed] = useState(false)
  const [search, setSearch] = useState("")
  const [results, setResults] = useState<{ query: string; items: EventOption[] } | null>(null)
  const selecting = value.level === "selected"
  const query = search.trim()

  const remember = (items: EventOption[]) => setKnown((current) => {
    const next = { ...current }
    for (const item of items) next[item.ID] = item
    return next
  })

  // Prefetch on open, not on the radio switch.
  useEffect(() => {
    let active = true
    listNearestEvents()
      .then((items) => { if (active) { setNearest(items); remember(items) } })
      .catch(() => { if (active) { setNearest([]); setFailed(true) } })
    return () => { active = false }
  }, [])

  // Names of events selected before (they may not be among the nearest ones).
  const [initialIds] = useState(value.eventIds)
  useEffect(() => {
    let active = true
    for (const id of initialIds) {
      getEventOption(id).then((item) => { if (active) remember([item]) }).catch(() => undefined)
    }
    return () => { active = false }
  }, [initialIds])

  useEffect(() => {
    if (!query) return
    let active = true
    const id = setTimeout(() => {
      listEventOptions(query, SEARCH_LIMIT)
        .then((items) => { if (active) { setResults({ query, items }); remember(items) } })
        .catch(() => { if (active) { setResults({ query, items: [] }); setFailed(true) } })
    }, 250)
    return () => { active = false; clearTimeout(id) }
  }, [query])

  const loading = query ? results?.query !== query : nearest === null
  const candidates = useMemo(() => (query ? results?.query === query ? results.items : [] : nearest ?? [])
    .filter((event) => !value.eventIds.includes(event.ID)), [query, results, nearest, value.eventIds])

  const levels: AccessChoice[] = allowOwn ? ["all", "selected", "own"] : ["all", "selected"]

  function toggle(id: string) {
    const eventIds = value.eventIds.includes(id) ? value.eventIds.filter((item) => item !== id) : [...value.eventIds, id]
    onChange({ ...value, eventIds })
  }

  const row = (event: EventOption) => (
    <label key={event.ID} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted">
      <input type="checkbox" checked={value.eventIds.includes(event.ID)} onChange={() => toggle(event.ID)} disabled={disabled}
        className="h-4 w-4 accent-primary" />
      <span className="min-w-0 flex-1 truncate">{event.Name || event.Tag || event.ID}</span>
      {event.Tag && event.Name && <span className="font-mono text-xs text-muted-foreground">{event.Tag}</span>}
    </label>
  )

  return (
    <div className="space-y-3">
      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="mb-1 text-sm font-medium text-foreground">{t("exercises.access.title")}</legend>
        {levels.map((level) => (
          <label key={level} className="flex cursor-pointer items-start gap-2 text-sm">
            <input type="radio" name="access-level" value={level} checked={value.level === level}
              onChange={() => onChange({ ...value, level })} className="mt-0.5 h-4 w-4 accent-primary" />
            <span>
              <span className="text-foreground">{t(`exercises.access.level.${level}`)}</span>
              <span className="block text-xs text-muted-foreground">
                {level === "own" && originEventName ? `${t("exercises.access.help.own")}: ${originEventName}` : t(`exercises.access.help.${level}`)}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      {selecting && (
        <div className="space-y-2">
          <Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("exercises.access.search")}
            aria-label={t("exercises.access.search")} disabled={disabled} />
          <div role="group" aria-label={t("exercises.access.events")} aria-busy={loading} data-testid="access-events"
            className="h-56 space-y-1 overflow-y-auto rounded-md border border-border p-2">
            {value.eventIds.map((id) => row(known[id] ?? { ID: id, Name: "", Tag: "" }))}
            {value.eventIds.length > 0 && (loading || candidates.length > 0) && <div role="separator" className="my-1 border-t border-border" />}
            {loading ? <LoadingArea compact className={value.eventIds.length ? "h-24" : "h-full"} label={t("admin.loading")} />
              : failed && candidates.length === 0 ? <div className={`flex items-center justify-center px-2 text-center ${value.eventIds.length ? "h-24" : "h-full"}`}><p role="alert" className="text-sm text-destructive">{t("exercises.access.loadError")}</p></div>
              : candidates.length === 0 ? value.eventIds.length === 0 && <EmptyState compact message={t("exercises.access.noEvents")} className="h-full min-h-0" />
              : candidates.map(row)}
            {!loading && !query && candidates.length > 0 && <p className="px-1.5 pt-1 text-xs text-muted-foreground">{t("exercises.access.searchHint")}</p>}
          </div>
          <p className="text-xs text-muted-foreground">{t("exercises.access.selected", { count: value.eventIds.length })}</p>
        </div>
      )}
    </div>
  )
}
