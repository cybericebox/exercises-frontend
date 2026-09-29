"use client"

import { useEffect, useMemo, useState } from "react"
import { listEventOptions, type EventOption } from "@/api/events/list"
import type { AccessLevel } from "@/api/exercises/catalog"
import { Input } from "@/components/ui/input"
import { LoadingArea } from "@/components/ui/spinner"
import { t } from "@/i18n/t"

export type AccessChoice = Exclude<AccessLevel, "">

export type AccessValue = { level: AccessChoice; eventIds: string[] }

export function accessValueValid(value: AccessValue): boolean {
  return value.level !== "selected" || value.eventIds.length > 0
}

/** Access level radios and, for «selected», a searchable multi-select of platform events. */
export function AccessLevelFields({ value, onChange, allowOwn, originEventName, disabled }: {
  value: AccessValue
  onChange: (value: AccessValue) => void
  allowOwn: boolean
  originEventName?: string
  disabled?: boolean
}) {
  const [events, setEvents] = useState<EventOption[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [search, setSearch] = useState("")
  const selecting = value.level === "selected"

  useEffect(() => {
    if (!selecting || events) return
    let active = true
    listEventOptions()
      .then((items) => { if (active) setEvents(items) })
      .catch(() => { if (active) { setEvents([]); setFailed(true) } })
    return () => { active = false }
  }, [selecting, events])

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (events ?? []).filter((event) => !query || event.Name.toLowerCase().includes(query) || event.Tag.toLowerCase().includes(query))
  }, [events, search])

  const levels: AccessChoice[] = allowOwn ? ["all", "selected", "own"] : ["all", "selected"]

  function toggle(id: string) {
    const eventIds = value.eventIds.includes(id) ? value.eventIds.filter((item) => item !== id) : [...value.eventIds, id]
    onChange({ ...value, eventIds })
  }

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
          <div role="group" aria-label={t("exercises.access.events")} className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border p-2">
            {events === null ? <LoadingArea className="h-20" label={t("admin.loading")} />
              : failed ? <p role="alert" className="text-sm text-destructive">{t("exercises.access.loadError")}</p>
              : visible.length === 0 ? <p className="text-sm text-muted-foreground">{t("exercises.access.noEvents")}</p>
              : visible.map((event) => (
                <label key={event.ID} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted">
                  <input type="checkbox" checked={value.eventIds.includes(event.ID)} onChange={() => toggle(event.ID)} disabled={disabled}
                    className="h-4 w-4 accent-primary" />
                  <span className="min-w-0 flex-1 truncate">{event.Name || event.Tag}</span>
                  {event.Tag && <span className="font-mono text-xs text-muted-foreground">{event.Tag}</span>}
                </label>
              ))}
          </div>
          <p className="text-xs text-muted-foreground">{t("exercises.access.selected").replace("{count}", String(value.eventIds.length))}</p>
        </div>
      )}
    </div>
  )
}
