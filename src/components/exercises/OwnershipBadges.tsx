"use client"

import { Network } from "lucide-react"
import { t } from "@/i18n/t"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import type { AccessLevel, ExerciseOwnership } from "@/api/exercises/catalog"

const PILL = "inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs"

export function accessLevelLabel(level: AccessLevel): string {
  return level ? t(`exercises.access.level.${level}`) : ""
}

/** Lab infrastructure marker (the exercise has devices), with a tooltip. */
export function InfrastructureIcon({ show }: { show: boolean }) {
  if (!show) return null
  const label = t("exercises.infra.tooltip")
  return (
    <HoverTooltip text={label}>
      <span role="img" aria-label={label} className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-primary">
        <Network aria-hidden="true" className="h-4 w-4" />
      </span>
    </HoverTooltip>
  )
}

/** Scope, fork, proposal and (for admins) access badges; the catalog table shows scope and access in their own column. */
export function OwnershipBadges({ exercise, showAccess, showEvent = true }: { exercise: ExerciseOwnership; showAccess: boolean; showEvent?: boolean }) {
  const badges: { key: string; label: string; tone: string }[] = []
  if (showEvent && exercise.Scope === "event") {
    badges.push({
      key: "event",
      label: exercise.OwnerEventName ? `${t("exercises.badge.event")} · ${exercise.OwnerEventName}` : t("exercises.badge.event"),
      tone: "bg-primary/10 text-primary",
    })
  }
  if (exercise.ForkedFrom) {
    badges.push({ key: "fork", label: `${t("exercises.badge.fork")}: ${exercise.ForkedFrom.ExerciseName}`, tone: "bg-muted text-muted-foreground" })
  }
  if (exercise.PendingProposalID) {
    badges.push({ key: "proposal", label: t("exercises.badge.pending"), tone: "bg-[var(--ib-warn-bg)] text-[var(--ib-warn)]" })
  }
  if (showAccess && exercise.Scope === "catalog" && exercise.AccessLevel) {
    badges.push({ key: "access", label: accessLevelLabel(exercise.AccessLevel), tone: "bg-secondary/40 text-foreground" })
  }
  if (badges.length === 0) return null
  return (
    <span className="flex flex-wrap gap-1">
      {badges.map((badge) => <span key={badge.key} data-badge={badge.key} className={`${PILL} ${badge.tone}`}>{badge.label}</span>)}
    </span>
  )
}
