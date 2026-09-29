"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { getExercise, type ExerciseListItem, type ExerciseOwnership } from "@/api/exercises/catalog"
import { getEventOption } from "@/api/events/list"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { LoadingArea } from "@/components/ui/spinner"
import { accessInfo, catalogStatus, type CatalogStatus } from "@/lib/catalogList"
import { EmptyState } from "@/components/ui/empty-state"
import { t } from "@/i18n/t"

const STATUS_TONE: Record<CatalogStatus, string> = {
  published: "text-primary",
  changed: "text-foreground",
  draft: "text-muted-foreground",
  archived: "text-muted-foreground",
  none: "text-muted-foreground",
}

export function statusLabel(status: CatalogStatus): string {
  return status === "none" ? t("admin.ex.filterStatusNone") : t(`admin.ex.status.${status === "draft" ? "draftOnly" : status}`)
}

/** One status per row. */
export function StatusCell({ item }: { item: ExerciseListItem }) {
  const status = catalogStatus(item)
  return <span data-status={status} className={`whitespace-nowrap text-sm ${STATUS_TONE[status]}`}>{statusLabel(status)}</span>
}

/**
 * Who can use the exercise. «Обраним подіям» opens the event list; the list
 * API does not return AccessEventIDs, so the card is fetched on first open.
 */
export function AccessCell({ item, eventName }: { item: ExerciseOwnership & { ID: string }; eventName: (id: string) => string | undefined }) {
  const info = accessInfo(item)
  const [ids, setIds] = useState<string[] | null>(info.eventIds.length ? info.eventIds : null)
  const [failed, setFailed] = useState(false)
  const [names, setNames] = useState<Record<string, string>>({})
  const nameOf = (id: string) => eventName(id) ?? names[id]

  // Events outside the caller's known list: look the names up (admins); the ID stays as fallback.
  function resolve(list: string[]) {
    for (const id of list) {
      if (nameOf(id)) continue
      getEventOption(id).then((event) => setNames((current) => ({ ...current, [id]: event.Name || event.Tag || id }))).catch(() => undefined)
    }
  }

  if (info.kind === "event") {
    return <span className="text-sm">{info.eventName ? t("exercises.accessCol.event", { name: info.eventName }) : t("exercises.badge.event")}</span>
  }
  if (info.kind === "none") return <span className="text-muted-foreground">—</span>
  if (info.kind !== "selected") {
    const origin = info.kind === "own" && info.eventIds[0] ? eventName(info.eventIds[0]) : undefined
    return <span className="whitespace-nowrap text-sm" title={origin}>{t(`exercises.access.level.${info.kind}`)}</span>
  }

  const count = ids?.length
  const label = count ? `${t("exercises.access.level.selected")} · ${count}` : t("exercises.access.level.selected")

  function load() {
    if (ids) { resolve(ids); return }
    if (failed) return
    getExercise(item.ID).then((card) => { setIds(card.AccessEventIDs); resolve(card.AccessEventIDs) }).catch(() => setFailed(true))
  }

  return (
    <Popover onOpenChange={(open) => { if (open) load() }}>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex items-center gap-1 whitespace-nowrap rounded text-sm underline decoration-dotted underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          {label}<ChevronDown aria-hidden="true" className="h-3.5 w-3.5 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <p className="mb-1 text-xs text-muted-foreground">{t("exercises.accessCol.eventsTitle")}</p>
        {failed ? <p role="alert" className="text-sm text-destructive">{t("exercises.access.loadError")}</p>
          : ids === null ? <LoadingArea compact className="h-40" label={t("admin.loading")} />
          : ids.length === 0 ? <EmptyState compact message={t("exercises.access.noEvents")} className="h-40 min-h-0" />
          : <ul className="h-40 space-y-1 overflow-y-auto">
            {ids.map((id) => <li key={id} className="truncate">{nameOf(id) ?? id}</li>)}
          </ul>}
      </PopoverContent>
    </Popover>
  )
}
