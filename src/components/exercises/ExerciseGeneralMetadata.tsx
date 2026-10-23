"use client"

import { useState } from "react"
import { useWatch, type UseFormReturn } from "react-hook-form"
import { X } from "lucide-react"
import type { Version, VersionResources } from "@/api/exercises/versions"
import type { Exercise } from "@/api/exercises/catalog"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { FieldHelp } from "@/components/ui/field-help"
import { Badge } from "@/components/ui/badge"
import { accessInfo, DIFFICULTY_LEVELS, difficultyName } from "@/lib/catalogList"
import { formatCPU, formatMemory } from "@/lib/deviceResources"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { formatExerciseDate, formatExerciseDateTime } from "@/lib/exerciseStatus"
import { t } from "@/i18n/t"

export type GeneralStatus = "published" | "changed" | "draft" | "archived" | "none"

const STATUS_TONE: Record<GeneralStatus, "ok" | "warn" | "neutral" | "muted"> = { published: "ok", changed: "warn", draft: "neutral", archived: "muted", none: "muted" }

/** The mean level (1..6) of variant 1's subtasks, null without one: every variant has the same levels. */
export function averageDifficulty(tasks: { Difficulty: string }[]): number | null {
  const levels = tasks.map((task) => DIFFICULTY_LEVELS.indexOf(task.Difficulty as (typeof DIFFICULTY_LEVELS)[number]) + 1).filter((level) => level > 0)
  return levels.length ? levels.reduce((sum, level) => sum + level, 0) / levels.length : null
}

/**
 * The task's facts beside the General fields: status, publication, counts, the average difficulty (variant 1),
 * the resources of the largest variant (one solution needs that much), owner, author, access and where it is used.
 */
export function ExerciseGeneralMetadata({ exercise, publishedVersion, publishedAt, eventName, draftForm, status, resources, usageEvents = [] }: {
  exercise: Exercise
  publishedAt: string | null
  publishedVersion: Version | null
  eventName: (id: string) => string | undefined
  draftForm: UseFormReturn<DraftFormValues>
  status: GeneralStatus
  resources: VersionResources | null
  usageEvents?: string[]
}) {
  const [open, setOpen] = useState(false)
  const counts = useWatch({ control: draftForm.control, name: "Variants", compute: (variants: DraftFormValues["Variants"]) => ({
    variants: variants.length,
    subtasks: variants[0]?.Tasks.length ?? 0,
    average: averageDifficulty(variants[0]?.Tasks ?? []),
  }) })
  const info = accessInfo(exercise)
  const names = new Map(exercise.AccessEvents.map((event) => [event.ID, event.Name]))
  const knownName = (id: string) => names.get(id) || eventName(id)
  const availability = info.kind === "event"
    ? info.eventName ? t("exercises.accessCol.event", { name: info.eventName }) : t("exercises.badge.event")
    : info.kind === "unknown" ? t("admin.exGeneral.accessUnknown") : t(`exercises.access.level.${info.kind}`)
  // An absent/redacted authorized list never means zero availability. Do not resolve
  // hidden event names through a second endpoint or expose their IDs as names.
  const events = info.eventIds.map((id) => ({ id, name: knownName(id) }))
  const owner = exercise.Scope === "event" ? exercise.OwnerEventName || exercise.OwnerEvent?.Name || t("exercises.badge.event") : t("exercises.owner.catalog")
  const largest = resources?.Max
  const publication = publishedVersion?.ID === exercise.PublishedVersionID && publishedVersion?.ExerciseID === exercise.ID ? publishedVersion : null
  return <aside className="general-facts" aria-label={t("admin.exGeneral.facts")}>
    <dl>
      <div><dt>{t("admin.exGeneral.status")}</dt><dd><Badge tone={STATUS_TONE[status]}>{t(`exercises.status.short.${status}`)}</Badge>{publication?.ExerciseID === exercise.ID && publication.Resources?.ResourceHeavy && <Badge tone="info" data-heavy="">{t("exercises.res.heavy")}</Badge>}{exercise.UpdatedAt && <span className="text-muted-foreground">{t("admin.exGeneral.since", { date: formatExerciseDate(exercise.UpdatedAt) })}</span>}</dd></div>
      {publishedAt && <div><dt>{t("admin.exGeneral.published")}</dt><dd><time dateTime={publishedAt} data-published="">{formatExerciseDateTime(publishedAt)}</time></dd></div>}
      <div><dt>{t("admin.exGeneral.counts")}</dt><dd>{t("admin.exGeneral.countsValue", { subtasks: counts.subtasks, variants: counts.variants })}</dd></div>
      <div><dt className="flex items-center gap-1">{t("admin.exGeneral.difficulty")}<FieldHelp text={t("admin.exGeneral.difficultyHelp")} /></dt>
        <dd>{counts.average === null ? "—" : t(`admin.ex.difficulty.${difficultyName(counts.average)}`)}</dd></div>
      {largest && largest.Devices > 0 && <div><dt className="flex items-center gap-1">{t("admin.exGeneral.resources")}<FieldHelp text={t("admin.exGeneral.resourcesMaxHelp")} /></dt>
        <dd>{t("admin.exGeneral.resourcesValue", { cpu: formatCPU(largest.CPUMillicores), memory: formatMemory(largest.MemoryBytes) })}</dd></div>}
      <div><dt>{t("admin.exGeneral.owner")}</dt><dd>{owner}</dd></div>
      <div><dt>{t("admin.exGeneral.authorLabel")}</dt><dd>{exercise.AuthorName || t("exercises.author.unknown")}</dd></div>
      <div><dt>{t("admin.exGeneral.access")}</dt><dd>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><button type="button" className="general-access">{availability}</button></DialogTrigger>
          <DialogContent className="max-w-lg gap-4">
            <div className="flex items-center justify-between gap-4">
              <DialogTitle>{t("admin.exGeneral.access")}</DialogTitle>
              <DialogClose asChild><button type="button" aria-label={t("admin.exGeneral.close")} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary"><X aria-hidden="true" className="h-4 w-4" /></button></DialogClose>
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
      </dd></div>
      {usageEvents.length > 0 && <div><dt>{t("admin.exGeneral.usedIn")}</dt><dd>{usageEvents.join(", ")}</dd></div>}
    </dl>
  </aside>
}
