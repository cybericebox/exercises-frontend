"use client"

import { useMemo, useState } from "react"
import { ChevronDown } from "lucide-react"
import type { EventOption } from "@/api/events/list"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { t } from "@/i18n/t"
import { cn } from "@/utils/cn"

export function eventLabel(event: EventOption): string {
  return event.Name || event.Tag || event.ID
}

/** Checkbox list of events with a search box; the trigger names one event or counts several. */
export function EventMultiSelect({ options, value, onChange, className }: {
  options: EventOption[]
  value: string[]
  onChange: (value: string[]) => void
  className?: string
}) {
  const [search, setSearch] = useState("")
  // Selected events missing from the options (an old link) stay visible and removable.
  const all = useMemo(() => [
    ...options,
    ...value.filter((id) => !options.some((event) => event.ID === id)).map((id) => ({ ID: id, Name: "", Tag: "" })),
  ], [options, value])
  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("uk")
    return all.filter((event) => !query || event.Name.toLocaleLowerCase("uk").includes(query) || event.Tag.toLocaleLowerCase("uk").includes(query))
  }, [all, search])

  const first = all.find((event) => event.ID === value[0])
  const summary = value.length === 0 ? t("exercises.filter.eventAll")
    : value.length === 1 && first ? eventLabel(first)
      : t("exercises.filter.eventCount").replace("{count}", String(value.length))

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id])
  }

  return (
    <Popover onOpenChange={(open) => { if (!open) setSearch("") }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" aria-label={t("exercises.filter.event")}
          className={cn("h-10 justify-between font-normal", className)}>
          <span className="truncate">{summary}</span>
          <ChevronDown aria-hidden="true" className="ml-2 h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-2">
        <Input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
          placeholder={t("exercises.filter.eventSearch")} aria-label={t("exercises.filter.eventSearch")} className="h-9" />
        <div role="group" aria-label={t("exercises.filter.event")} className="max-h-64 space-y-0.5 overflow-y-auto">
          {visible.length === 0
            ? <p className="px-1.5 py-1 text-sm text-muted-foreground">{t("exercises.access.noEvents")}</p>
            : visible.map((event) => (
              <label key={event.ID} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted">
                <input type="checkbox" checked={value.includes(event.ID)} onChange={() => toggle(event.ID)} className="h-4 w-4 accent-primary" />
                <span className="min-w-0 flex-1 truncate">{eventLabel(event)}</span>
                {event.Tag && event.Name && <span className="font-mono text-xs text-muted-foreground">{event.Tag}</span>}
              </label>
            ))}
        </div>
        {value.length > 0 && (
          <div className="flex items-center justify-between border-t border-border pt-2 text-xs text-muted-foreground">
            <span>{t("exercises.access.selected").replace("{count}", String(value.length))}</span>
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onChange([])}>
              {t("exercises.filter.eventClear")}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
