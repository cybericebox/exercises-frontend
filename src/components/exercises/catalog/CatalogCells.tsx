"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { getExercise, type ExerciseListItem, type ExerciseOwnership } from "@/api/exercises/catalog"
import { getEventOption } from "@/api/events/list"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { LoadingArea } from "@/components/ui/spinner"
import { Badge, type BadgeTone } from "@/components/ui/badge"
import { accessInfo, catalogStatus, type CatalogStatus } from "@/lib/catalogList"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadError } from "@/components/ui/load-error"
import { t } from "@/i18n/t"
import { HoverTooltip } from "@/components/ui/hover-tooltip"

const STATUS_BADGES: Record<CatalogStatus, { key: string; tone: BadgeTone }[]> = {
  published: [{ key: "admin.ex.status.published", tone: "ok" }],
  changed: [{ key: "admin.ex.status.published", tone: "ok" }, { key: "admin.ex.status.changedBadge", tone: "warn" }],
  draft: [{ key: "admin.ex.status.draftOnly", tone: "neutral" }],
  archived: [{ key: "admin.ex.status.archived", tone: "muted" }],
  none: [{ key: "admin.ex.filterStatusNone", tone: "muted" }],
}

/** Status as badges: published is green, draft changes add a yellow badge next to it. */
export function StatusBadges({ status }: { status: CatalogStatus }) {
  return <span data-status={status} className="inline-flex flex-wrap items-center gap-1">
    {STATUS_BADGES[status].map(({ key, tone }) => <Badge key={key} tone={tone} data-badge={tone}>{t(key)}</Badge>)}
  </span>
}

/** Tasks with an approved resource elevation are marked in lists. */
export function ResourceHeavyBadge({ show }: { show: boolean }) {
  return show ? <Badge tone="info" data-badge="resource-heavy">{t("exercises.res.heavy")}</Badge> : null
}

/** One status per row. */
export function StatusCell({ item }: { item: ExerciseListItem }) {
  return <span className="inline-flex flex-wrap items-center gap-1">
    <StatusBadges status={catalogStatus(item)} />
    <ResourceHeavyBadge show={item.ResourceHeavy} />
  </span>
}

/**
 * Who can use the exercise. «Обраним заходам» opens the event list; the list
 * API does not return AccessEventIDs, so the card is fetched on first open.
 */
export function AccessCell({ item, eventName }: { item: ExerciseOwnership & { ID: string }; eventName: (id: string) => string | undefined }) {
  const info = accessInfo(item)
  const [ids, setIds] = useState<string[] | null>(info.eventIds.length ? info.eventIds : null)
  const [failed, setFailed] = useState<{ cause: unknown } | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const listed = Object.fromEntries(item.AccessEvents.map((event) => [event.ID, event.Name]))
  const nameOf = (id: string) => listed[id] || eventName(id) || names[id]

  // Names come with the list (admins); otherwise look them up, the ID stays as fallback.
  function resolve(list: string[]) {
    for (const id of list) {
      if (nameOf(id)) continue
      getEventOption(id).then((event) => setNames((current) => ({ ...current, [id]: event.Name || event.Tag || id }))).catch(() => undefined)
    }
  }

  if (info.kind === "event") {
    return <span className="text-sm">{info.eventName ? t("exercises.accessCol.event", { name: info.eventName }) : t("exercises.badge.event")}</span>
  }
  if (info.kind === "unknown") return <span className="text-muted-foreground">—</span>
  if (info.kind !== "selected") {
    const origin = info.kind === "own" && info.eventIds[0] ? eventName(info.eventIds[0]) : undefined
    const level = t(`exercises.access.level.${info.kind}`)
    return origin
      ? <HoverTooltip text={origin}><span className="whitespace-nowrap text-sm">{level}{" "}<span className="sr-only">{origin}</span></span></HoverTooltip>
      : <span className="whitespace-nowrap text-sm">{level}</span>
  }

  const count = ids?.length
  const label = count ? t("exercises.accessCol.selectedCount", { count }) : t("exercises.access.level.selected")

  function fetchIds() {
    getExercise(item.ID).then((card) => { setIds(card.AccessEventIDs); resolve(card.AccessEventIDs) }).catch((cause) => setFailed({ cause }))
  }

  function load() {
    if (ids) { resolve(ids); return }
    if (!failed) fetchIds()
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
        {failed ? <LoadError compact message={t("exercises.access.loadError")} error={failed.cause} className="h-40 min-h-0" onRetry={() => { setFailed(null); fetchIds() }} />
          : ids === null ? <LoadingArea compact className="h-40" label={t("admin.loading")} />
          : ids.length === 0 ? <EmptyState compact message={t("exercises.access.noEvents")} className="h-40 min-h-0" />
          : <ul className="h-40 space-y-1 overflow-y-auto">
            {ids.map((id) => <li key={id} className="truncate">{nameOf(id) ?? id}</li>)}
          </ul>}
      </PopoverContent>
    </Popover>
  )
}
