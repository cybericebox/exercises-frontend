"use client"

import { useState } from "react"
import { requestElevation, type Elevation } from "@/api/exercises/elevation"
import { Badge, type BadgeTone } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { LoadError } from "@/components/ui/load-error"
import { LoadingArea } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { t } from "@/i18n/t"
import {
  CEILING, FRAME, coveredBy, cpuQuantity, formatCPU, formatMemory, memoryQuantity, type FrameIssue,
} from "@/lib/deviceResources"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"
import { formatExerciseDateTime } from "@/lib/exerciseStatus"
import type { ResourceGate } from "./useResourceGate"

/** Backend limit of the elevation reason. */
export const ELEVATION_REASON_LIMIT = 1000

type IssueState = "approved" | "pending" | "rejected" | "needed" | "ceiling"

function issueState(issue: FrameIssue, elevation: Elevation | null): IssueState {
  if (issue.tooLarge) return "ceiling"
  if (issue.covered) return "approved"
  const requested = elevation?.Requested.find((entry) => entry.DeviceID === issue.deviceID)
  if (elevation && requested && coveredBy(issue.amount, requested)) {
    if (elevation.Status === "pending") return "pending"
    if (elevation.Status === "rejected") return "rejected"
  }
  return "needed"
}

const STATE_TONE: Record<IssueState, BadgeTone> = { approved: "ok", pending: "info", rejected: "warn", needed: "warn", ceiling: "warn" }

function range(min: number, max: number, format: (value: number) => string): string {
  return min === max ? format(max) : `${format(min)} – ${format(max)}`
}

function TotalsLine({ gate }: { gate: ResourceGate }) {
  const { min, max } = gate.totals
  const pair = (key: string, value: string) => <span key={key} className="whitespace-nowrap"><span className="text-muted-foreground">{t(`exercises.res.total.${key}`)}</span> <span className="font-medium">{value}</span></span>
  return <p data-resource-totals className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
    {pair("cpu", range(min.cpu, max.cpu, formatCPU))}
    {pair("memory", range(min.memory, max.memory, formatMemory))}
    {pair("devices", range(min.devices, max.devices, String))}
  </p>
}

/**
 * The resources of the task: totals (a range over variants), the variant spread warning,
 * the devices outside the frame with the elevation state, and the publish block.
 */
export function ResourcesPanel({ exerciseId, gate, canRequest, canPublish, flush }: {
  exerciseId: string | null
  gate: ResourceGate
  /** The author is editing: a request may be sent. */
  canRequest: boolean
  canPublish: boolean
  /** Saves the working copy first, so the request refers to what is on screen. */
  flush: () => Promise<boolean>
}) {
  const [dialog, setDialog] = useState(false)
  const { elevation, issues } = gate
  const open = issues.filter((issue) => issue.covered === false)
  const requestable = open.filter((issue) => ["needed", "rejected"].includes(issueState(issue, elevation)))
  const ceilingIssues = issues.filter((issue) => issue.tooLarge)

  return <section data-resources-panel aria-label={t("exercises.res.title")} className="mb-3 min-w-0 space-y-3 rounded-md border border-border p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">{t("exercises.res.title")}</h3>
      {canRequest && requestable.length > 0 && !ceilingIssues.length && <Button type="button" variant="outline" size="sm" disabled={!exerciseId} onClick={() => setDialog(true)}>
        {t("exercises.res.request")}
      </Button>}
    </div>
    <TotalsLine gate={gate} />
    {gate.totals.variants > 1 && <p className="text-xs text-muted-foreground">{t("exercises.res.rangeNote", { count: gate.totals.variants })}</p>}
    {gate.differ && <p role="status" data-variants-differ className="text-xs text-[var(--ib-warn)]">{t("exercises.res.variantsDiffer")}</p>}

    {exerciseId && gate.loading ? <LoadingArea compact className="h-24" label={t("admin.loading")} />
      : exerciseId && gate.error ? <LoadError compact message={t("exercises.res.loadError")} error={gate.error} className="h-24 min-h-0" onRetry={gate.reload} />
      : <>
        {issues.length > 0 && <ul data-frame-issues className="divide-y divide-border">
          {issues.map((issue) => {
            const state = issueState(issue, elevation)
            return <li key={issue.deviceID} data-issue-state={state} className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-medium">{issue.deviceName || t("exercises.res.unnamed")}</span>{" "}
                <span className="text-muted-foreground">{formatCPU(issue.amount.cpu)} · {formatMemory(issue.amount.memory)}</span>
              </span>
              <Badge tone={STATE_TONE[state]}>{t(`exercises.res.state.${state}`)}</Badge>
            </li>
          })}
        </ul>}
        {issues.length > 0 && <ElevationState elevation={elevation} />}
        {ceilingIssues.length > 0 && <p role="alert" data-ceiling className="text-xs text-[var(--ib-warn)]">
          {t("exercises.res.ceiling", { cpu: formatCPU(CEILING.cpu), memory: formatMemory(CEILING.memory) })}
        </p>}
        {gate.blocked && canPublish && <p role="alert" data-publish-blocked className="text-xs text-[var(--ib-warn)]">
          {t("exercises.res.publishBlocked", { count: open.length })}
        </p>}
      </>}

    {dialog && exerciseId && <ElevationDialog exerciseId={exerciseId} issues={requestable} flush={flush}
      onClose={() => setDialog(false)} onSent={(next) => { gate.setElevation(next); setDialog(false) }} />}
  </section>
}

function ElevationState({ elevation }: { elevation: Elevation | null }) {
  if (!elevation || elevation.Status === "none") return <p className="text-xs text-muted-foreground">{t("exercises.res.frameHint", { cpu: formatCPU(FRAME.cpu), memory: formatMemory(FRAME.memory) })}</p>
  const when = (iso: string | null) => iso ? formatExerciseDateTime(iso) : ""
  return <div data-elevation-status={elevation.Status} className="space-y-1 text-xs">
    {elevation.Status === "pending" && <p>{t("exercises.res.pending", { date: when(elevation.RequestedAt) })}</p>}
    {elevation.Status === "rejected" && <p className="text-[var(--ib-warn)]">{t("exercises.res.rejected", { date: when(elevation.ReviewedAt) })}{elevation.ReviewNote ? ` ${elevation.ReviewNote}` : ""}</p>}
    {elevation.Approved.length > 0 && <div data-approved>
      <p>{t("exercises.res.approved")}</p>
      <ul className="text-muted-foreground">
        {elevation.Approved.map((entry) => <li key={entry.DeviceID}>{entry.DeviceName || entry.DeviceID}: {entry.CPU} · {entry.Memory}</li>)}
      </ul>
      <p className="text-muted-foreground">{t("exercises.res.raiseNote")}</p>
    </div>}
  </div>
}

function ElevationDialog({ exerciseId, issues, flush, onClose, onSent }: {
  exerciseId: string
  issues: FrameIssue[]
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
      onSent(await requestElevation(exerciseId, {
        Reason: trimmed,
        Devices: issues.map((issue) => ({ DeviceID: issue.deviceID, CPU: cpuQuantity(issue.amount.cpu), Memory: memoryQuantity(issue.amount.memory) })),
      }))
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
        {issues.map((issue) => <li key={issue.deviceID} className="flex items-center justify-between gap-3 py-1.5">
          <span className="min-w-0 truncate font-medium">{issue.deviceName || t("exercises.res.unnamed")}</span>
          <span className="shrink-0 text-muted-foreground">{formatCPU(issue.amount.cpu)} · {formatMemory(issue.amount.memory)}</span>
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

