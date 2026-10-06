"use client"

import { useEffect, useId, useRef, useState } from "react"
import { RotateCw, TriangleAlert } from "lucide-react"

import { resetDeployDevice, setDeployDeviceRescue, type DeployDeviceStatus } from "@/api/exercises/deploy"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldHelp } from "@/components/ui/field-help"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/toast"
import { t } from "@/i18n/t"
import { agoText, failureReasonLabel, sizeText } from "@/lib/deviceLive"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"

/** The warning of a device that did not start: reason, restarts and the last message of the node. */
export function DeviceFailure({ device }: { device: DeployDeviceStatus }) {
  const failure = device.Scheduling?.Failure
  if (!failure) return null
  return <div role="alert" className="space-y-1 rounded-md bg-[var(--ib-warn-bg)] p-3 text-xs text-foreground">
    <div className="flex items-start gap-2 font-medium">
      <TriangleAlert aria-hidden="true" size={14} className="mt-0.5 shrink-0 text-[var(--ib-warn)]" />
      <span>{t("admin.exLive.failure.title", { reason: failureReasonLabel(failure.Reason) })}</span>
    </div>
    {failure.RestartCount > 0 && <div className="text-muted-foreground">{t("admin.exLive.failure.restarts", { n: failure.RestartCount })}</div>}
    {failure.Message && <div className="break-words font-mono text-muted-foreground">{t("admin.exLive.failure.message", { message: failure.Message })}</div>}
  </div>
}

/**
 * Live part of a device card: the failure, and for a persistence device the saved state,
 * «Скинути пристрій» and the rescue switch. The switch answers at once and saves through a
 * queue, so quick changes never race and nothing is disabled while a save is pending.
 */
export function DeviceLiveInfo({ deployId, device }: { deployId: string; device: DeployDeviceStatus | undefined }) {
  const rescueId = useId()
  const name = device?.Name ?? ""
  const snapshot = device?.Snapshot ?? null
  const [override, setOverride] = useState<boolean | null>(null)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const waiting = useRef(0)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState("")

  // The server caught up with the choice: show what it says again.
  const rescueNow = snapshot?.Rescue
  useEffect(() => {
    if (waiting.current === 0 && override !== null && override === rescueNow) setOverride(null)
  }, [rescueNow, override])

  if (!device) return null
  const rescue = override ?? snapshot?.Rescue ?? false

  function toggleRescue(enable: boolean) {
    setOverride(enable)
    waiting.current += 1
    queue.current = queue.current.then(() => setDeployDeviceRescue(deployId, name, enable)).then(
      () => { waiting.current -= 1 },
      (cause) => {
        waiting.current -= 1
        if (waiting.current === 0) setOverride(null)
        toast.error(t("admin.exLive.rescueFailed", { reason: exerciseErrorMessage(cause) }))
      }
    )
  }

  async function reset() {
    setResetting(true)
    setResetError("")
    try {
      await resetDeployDevice(deployId, name)
      setResetOpen(false)
      toast.success(t("admin.exLive.resetDone"))
    } catch (cause) {
      setResetError(t("admin.exLive.resetFailed", { reason: exerciseErrorMessage(cause) }))
    } finally {
      setResetting(false)
    }
  }

  return <>
    <DeviceFailure device={device} />
    {snapshot && <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-foreground">{t("admin.exLive.snapshot.title")}</div>
        {snapshot.Warning && <Badge tone="warn">{t("admin.exLive.snapshot.warning")}</Badge>}
      </div>
      <div className="space-y-0.5 text-foreground">
        <div>{snapshot.LastSnapshotAt ? t("admin.exLive.snapshot.saved", { time: agoText(snapshot.LastSnapshotAt) }) : t("admin.exLive.snapshot.none")}</div>
        {snapshot.RestoredAt && <div>{t("admin.exLive.snapshot.restored", { time: agoText(snapshot.RestoredAt) })}</div>}
        {snapshot.SizeBytes > 0 && <div className="text-muted-foreground">{t("admin.exLive.snapshot.size", { size: sizeText(snapshot.SizeBytes) })}</div>}
      </div>
      {snapshot.Warning && <div className="break-words text-xs text-muted-foreground">{snapshot.Warning}</div>}
      <div className="flex items-center gap-2">
        <Switch id={rescueId} checked={rescue} onCheckedChange={toggleRescue} />
        <label htmlFor={rescueId}>{t("admin.exLive.rescue")}</label>
        <FieldHelp text={t("admin.exLive.rescueHelp")} />
      </div>
      {rescue && <div role="status" className="rounded-md bg-[var(--ib-warn-bg)] p-3 text-xs text-foreground">{t("admin.exLive.rescueBanner")}</div>}
      <Button type="button" variant="outline" size="sm" onClick={() => { setResetError(""); setResetOpen(true) }}>
        <RotateCw aria-hidden="true" size={14} />{t("admin.exLive.reset")}
      </Button>
      <ConfirmDialog open={resetOpen} tone="danger" busy={resetting} error={resetError} title={t("admin.exLive.resetTitle")}
        description={t("admin.exLive.resetDescription")} confirmLabel={t("admin.exLive.reset")} cancelLabel={t("admin.exPage.dialog.cancel")}
        onCancel={() => setResetOpen(false)} onConfirm={() => void reset()} />
    </div>}
  </>
}
