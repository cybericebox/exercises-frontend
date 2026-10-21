"use client"

import { useState } from "react"
import { Gauge, Network, X } from "lucide-react"
import type { Version } from "@/api/exercises/versions"
import type { Exercise } from "@/api/exercises/catalog"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { accessInfo } from "@/lib/catalogList"
import { formatExerciseDate } from "@/lib/exerciseStatus"
import { t } from "@/i18n/t"

/** Task-level creator/availability and published properties; never draft resources or a version's author. */
export function ExerciseGeneralMetadata({ exercise, publishedVersion, publishedAt, eventName }: {
  exercise: Exercise
  publishedAt: string | null
  publishedVersion: Version | null
  eventName: (id: string) => string | undefined
}) {
  const [open, setOpen] = useState(false)
  const publication = publishedVersion?.ID === exercise.PublishedVersionID && publishedVersion.ExerciseID === exercise.ID ? publishedVersion : null
  const hasNetwork = publication?.Variants.some((variant) => variant.Topology.Devices.length > 0) ?? false
  const hasApprovedResources = publication?.Resources?.ResourceHeavy ?? false
  const info = accessInfo(exercise)
  const names = new Map(exercise.AccessEvents.map((event) => [event.ID, event.Name]))
  const knownName = (id: string) => names.get(id) || eventName(id)
  const availability = info.kind === "event"
    ? info.eventName ? t("exercises.accessCol.event", { name: info.eventName }) : t("exercises.badge.event")
    : info.kind === "unknown" ? t("admin.exGeneral.accessUnknown") : t(`exercises.access.level.${info.kind}`)
  // An absent/redacted authorized list never means zero availability. Do not resolve
  // hidden event names through a second endpoint or expose their IDs as names.
  const events = info.eventIds.map((id) => ({ id, name: knownName(id) }))
  return <div className="general-metadata">
    <div className="general-metadata-facts">
      <span className="general-author">{t("admin.exGeneral.author", { name: exercise.AuthorName || t("exercises.author.unknown") })}</span>
      <span className="general-published-group">
        {publishedAt && <time dateTime={publishedAt}>{t("admin.exPage.meta.published", { date: formatExerciseDate(publishedAt) })}</time>}
        {publication && <span className="inline-flex items-center gap-0.5">
          {hasNetwork && <HoverTooltip text={t("admin.exGeneral.networkHelp")} help focusHelp>
            <button type="button" className="general-property" aria-label={t("admin.exGeneral.network")}><Network aria-hidden="true" className="h-4 w-4" /></button>
          </HoverTooltip>}
          {hasApprovedResources && <HoverTooltip text={t("admin.exGeneral.resourcesHelp")} help focusHelp>
            <button type="button" className="general-property" aria-label={t("exercises.res.heavy")}><Gauge aria-hidden="true" className="h-4 w-4" /></button>
          </HoverTooltip>}
        </span>}
      </span>
    </div>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><button type="button" className="general-access">{t("admin.exGeneral.access")}</button></DialogTrigger>
      <DialogContent className="max-w-lg gap-4">
        <div className="flex items-center justify-between gap-4">
          <DialogTitle>{t("admin.exGeneral.access")}</DialogTitle>
          <DialogClose asChild><button type="button" aria-label={t("admin.exGeneral.close")} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary"><X aria-hidden="true" className="h-4 w-4" /></button></DialogClose>
        </div>
        <div>
          <p className="mb-1 text-xs text-muted-foreground">{t("admin.exGeneral.availability")}</p>
          <DialogDescription className="text-foreground">{availability}</DialogDescription>
          {(info.kind === "selected" || info.kind === "own") && (events.length ? <ul className="mt-2 max-h-[min(240px,calc(100dvh-180px))] overflow-y-auto overscroll-contain divide-y divide-border">
            {events.map(({ id, name }) => <li key={id} className="break-words py-2 text-sm">{name || t("admin.exGeneral.redactedEvent")}</li>)}
          </ul> : <p className="mt-2 text-sm text-muted-foreground">{t("admin.exGeneral.redactedEvents")}</p>)}
        </div>
      </DialogContent>
    </Dialog>
  </div>
}
