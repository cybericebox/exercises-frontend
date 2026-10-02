"use client"

import { useState } from "react"
import type { ResourcesConfig } from "@/api/exercises/capabilities"
import { requestElevation, type Elevation } from "@/api/exercises/elevation"
import type { DeviceOutside, VersionResources } from "@/api/exercises/versions"
import { Badge, type BadgeTone } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { t } from "@/i18n/t"
import { formatCPU, formatMemory } from "@/lib/deviceResources"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"
import { formatExerciseDateTime } from "@/lib/exerciseStatus"

/** Backend limit of the elevation reason. */
export const ELEVATION_REASON_LIMIT = 1000

type IssueState = "approved" | "pending" | "rejected" | "needed" | "ceiling"

function issueState(issue: DeviceOutside, elevation: Elevation | null): IssueState {
  if (issue.AboveCeiling) return "ceiling"
  if (issue.Covered) return "approved"
  if (elevation && elevation.Requested.some((entry) => entry.DeviceID === issue.DeviceID)) {
    if (elevation.Status === "pending") return "pending"
    if (elevation.Status === "rejected") return "rejected"
  }
  return "needed"
}

const STATE_TONE: Record<IssueState, BadgeTone> = { approved: "ok", pending: "info", rejected: "warn", needed: "warn", ceiling: "warn" }

function range(min: number, max: number, format: (value: number) => string): string {
  return min === max ? format(max) : `${format(min)} – ${format(max)}`
}

function TotalsLine({ resources }: { resources: VersionResources }) {
  const { Min: min, Max: max } = resources
  const pair = (key: string, value: string) => <span key={key} className="whitespace-nowrap"><span className="text-muted-foreground">{t(`exercises.res.total.${key}`)}</span> <span className="font-medium">{value}</span></span>
  return <p data-resource-totals className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
    {pair("cpu", range(min.CPUMillicores, max.CPUMillicores, formatCPU))}
    {pair("memory", range(min.MemoryBytes, max.MemoryBytes, formatMemory))}
    {pair("devices", range(min.Devices, max.Devices, String))}
  </p>
}

/**
 * The resources of the task as the server counts them (totals, a range over variants, the spread
 * warning), the devices outside the frame with the elevation state, and the publish block.
 */
export function ResourcesPanel({ exerciseId, resources, elevation, config, canRequest, canPublish, flush, onRequested }: {
  exerciseId: string | null
  resources: VersionResources | null
  elevation: Elevation | null
  config: ResourcesConfig | null
  /** The author is editing: a request may be sent. */
  canRequest: boolean
  canPublish: boolean
  /** Saves the working copy first, so the request refers to what is on screen. */
  flush: () => Promise<boolean>
  onRequested: (elevation: Elevation) => void
}) {
  const [dialog, setDialog] = useState(false)
  if (!resources) return null
  const issues = resources.Outside
  const open = issues.filter((issue) => !issue.Covered)
  const requestable = open.filter((issue) => ["needed", "rejected"].includes(issueState(issue, elevation)))
  const ceilingIssues = issues.filter((issue) => issue.AboveCeiling)

  return <section data-resources-panel aria-label={t("exercises.res.title")} className="mb-3 min-w-0 space-y-3 rounded-md border border-border p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">{t("exercises.res.title")}</h3>
      {canRequest && requestable.length > 0 && !ceilingIssues.length && <Button type="button" variant="outline" size="sm" disabled={!exerciseId} onClick={() => setDialog(true)}>
        {t("exercises.res.request")}
      </Button>}
    </div>
    <TotalsLine resources={resources} />
    {resources.Variants.length > 1 && <p className="text-xs text-muted-foreground">{t("exercises.res.rangeNote", { count: resources.Variants.length })}</p>}
    {resources.VariantsDiffer && <p role="status" data-variants-differ className="text-xs text-[var(--ib-warn)]">{t("exercises.res.variantsDiffer", { percent: Math.round(resources.SpreadPercent) })}</p>}

    {issues.length > 0 && <ul data-frame-issues className="divide-y divide-border">
      {issues.map((issue) => {
        const state = issueState(issue, elevation)
        return <li key={`${issue.VariantID}:${issue.DeviceID}`} data-issue-state={state} className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-sm">
          <span className="min-w-0 truncate">
            <span className="font-medium">{issue.Name || t("exercises.res.unnamed")}</span>{" "}
            <span className="text-muted-foreground">{formatCPU(issue.CPUMillicores)} · {formatMemory(issue.MemoryBytes)}</span>
          </span>
          <Badge tone={STATE_TONE[state]}>{t(`exercises.res.state.${state}`)}</Badge>
        </li>
      })}
    </ul>}
    {issues.length > 0 && <ElevationState elevation={elevation} config={config} />}
    {ceilingIssues.length > 0 && config && <p role="alert" data-ceiling className="text-xs text-[var(--ib-warn)]">
      {t("exercises.res.ceiling", { cpu: formatCPU(config.Ceiling.CPUMillicores), memory: formatMemory(config.Ceiling.MemoryBytes) })}
    </p>}
    {open.length > 0 && canPublish && <p role="alert" data-publish-blocked className="text-xs text-[var(--ib-warn)]">
      {t("exercises.res.publishBlocked", { count: open.length })}
    </p>}

    {dialog && exerciseId && <ElevationDialog exerciseId={exerciseId} issues={requestable} flush={flush}
      onClose={() => setDialog(false)} onSent={(next) => { onRequested(next); setDialog(false) }} />}
  </section>
}

function ElevationState({ elevation, config }: { elevation: Elevation | null; config: ResourcesConfig | null }) {
  if (!elevation) return config ? <p className="text-xs text-muted-foreground">{t("exercises.res.frameHint", { cpu: formatCPU(config.Frame.CPUMillicores), memory: formatMemory(config.Frame.MemoryBytes) })}</p> : null
  const when = (iso: string | null) => iso ? formatExerciseDateTime(iso) : ""
  return <div data-elevation-status={elevation.Status} className="space-y-1 text-xs">
    {elevation.Status === "pending" && <p>{t("exercises.res.pending", { date: when(elevation.RequestedAt) })}</p>}
    {elevation.Status === "rejected" && <p className="text-[var(--ib-warn)]">{t("exercises.res.rejected", { date: when(elevation.DecidedAt) })}{elevation.DecisionNote ? ` ${elevation.DecisionNote}` : ""}</p>}
    {elevation.Status === "approved" && elevation.Approved.length > 0 && <div data-approved>
      <p>{t("exercises.res.approved")}</p>
      <ul className="text-muted-foreground">
        {elevation.Approved.map((entry) => <li key={entry.DeviceID}>{entry.Name || entry.DeviceID}: {formatCPU(entry.CPUMillicores)} · {formatMemory(entry.MemoryBytes)}</li>)}
      </ul>
      <p className="text-muted-foreground">{t("exercises.res.raiseNote")}</p>
    </div>}
  </div>
}

function ElevationDialog({ exerciseId, issues, flush, onClose, onSent }: {
  exerciseId: string
  issues: DeviceOutside[]
  flush: () => Promise<boolean>
  onClose: () => void
  onSent: (elevation: Elevation) => void
}) {
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const trimmed = reason.trim()
  const tooLong = trimmed.length > ELEVATION_REASON_LIMIT

  async function submit() {
    setBusy(true)
    setError("")
    try {
      if (!(await flush())) { setError(t("admin.exPage.toast.saveFailed")); return }
      onSent(await requestElevation(exerciseId, trimmed))
    } catch (cause) {
      setError(exerciseErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return <Dialog open onOpenChange={(next) => { if (!next && !busy) onClose() }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t("exercises.res.dialog.title")}</DialogTitle>
        <DialogDescription>{t("exercises.res.dialog.description")}</DialogDescription>
      </DialogHeader>
      <ul data-requested-values className="divide-y divide-border text-sm">
        {issues.map((issue) => <li key={`${issue.VariantID}:${issue.DeviceID}`} className="flex items-center justify-between gap-3 py-1.5">
          <span className="min-w-0 truncate font-medium">{issue.Name || t("exercises.res.unnamed")}</span>
          <span className="shrink-0 text-muted-foreground">{formatCPU(issue.CPUMillicores)} · {formatMemory(issue.MemoryBytes)}</span>
        </li>)}
      </ul>
      <div className="space-y-1.5">
        <Label htmlFor="elevation-reason">{t("exercises.res.dialog.reason")}</Label>
        <Textarea id="elevation-reason" rows={4} value={reason} aria-invalid={tooLong} onChange={(event) => setReason(event.target.value)} />
        {tooLong && <p role="alert" className="text-xs text-destructive">{t("exercises.res.dialog.reasonTooLong")}</p>}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t("admin.exPage.dialog.cancel")}</Button>
        <Button type="button" busy={busy} disabled={!trimmed || tooLong} onClick={() => void submit()}>{t("exercises.res.dialog.send")}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}

