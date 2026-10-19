"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ExternalLink, LogOut, X } from "lucide-react"

import { destroyDeploy, type DeployListItem } from "@/api/exercises/deploy"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { t } from "@/i18n/t"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"
import { testLabHref } from "@/lib/exerciseRoutes"
import { useOtherLabsRunning } from "@/lib/useOtherLabsRunning"
import { LEASE_FAST_BELOW_MS, useLeaseClock } from "@/lib/useLeaseClock"
import { useExerciseNames, useVariantNumbers } from "@/lib/useExerciseNames"

/** "1:42" (h:mm, rounded up) while 10 minutes or more are left, "9:41" (m:ss) under that; zero at the end. */
export function timeLeft(expiresAt: string, now: number): string {
  const ms = Math.max(0, new Date(expiresAt).getTime() - now)
  if (ms < LEASE_FAST_BELOW_MS) {
    const seconds = Math.ceil(ms / 1000)
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
  }
  const minutes = Math.ceil(ms / 60000)
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`
}

/**
 * The user's running test labs: one row per lab (exercise, variant, time left) with an icon
 * button to open its test page and one to end it (after a danger confirmation). Used by the
 * navbar indicator and by the «Тест» button once the limit of running labs is reached.
 */
export function RunningLabsDialog({ open, items, description, onClose, onEnded, onExpired }: {
  open: boolean
  items: DeployListItem[]
  description?: string
  onClose: () => void
  /** A lab was ended here. */
  onEnded: (deployId: string) => void
  /** A lab's time ran out while the list was open: refetch the list once. */
  onExpired?: () => void
}) {
  const router = useRouter()
  const now = useLeaseClock(items.filter((item) => !item.Expired).map((item) => item.ExpiresAt), open, onExpired)
  const names = useExerciseNames(items.map((item) => item.ExerciseID))
  const variants = useVariantNumbers(items)
  const [ending, setEnding] = useState<DeployListItem | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const closeRef = useRef<HTMLButtonElement>(null)
  const othersRunning = useOtherLabsRunning(ending?.DeployID ?? null, 1)
  const statusOf = (item: DeployListItem) => item.Expired || new Date(item.ExpiresAt).getTime() <= now ? t("admin.exTest.expiredMark") : t("admin.exTest.left", { time: timeLeft(item.ExpiresAt, now) })
  const nameOf = (item: DeployListItem) => names[item.ExerciseID] ?? t("admin.exTest.unknownExercise")

  async function end() {
    if (!ending) return
    setBusy(true)
    setError("")
    try {
      await destroyDeploy(ending.DeployID)
      onEnded(ending.DeployID)
      setEnding(null)
    } catch (cause) {
      setError(exerciseErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return <>
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      {/* The first focus goes to the close button: on a row's icon it would open that icon's tooltip over the title. */}
      <DialogContent className="max-w-lg" {...(description ? {} : { "aria-describedby": undefined })}
        onOpenAutoFocus={(event) => { event.preventDefault(); closeRef.current?.focus() }}>
        <DialogHeader className="flex-row items-start justify-between gap-3 space-y-0 text-left">
          <div className="min-w-0 space-y-1.5">
            <DialogTitle>{t("admin.exTest.runningTitle")}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </div>
          <DialogClose asChild>
            <button ref={closeRef} type="button" aria-label={t("admin.exTest.runningClose")} className="ib-hit shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary"><X aria-hidden="true" className="h-5 w-5" /></button>
          </DialogClose>
        </DialogHeader>
        <ul className="space-y-1.5">
          {items.map((item) => {
            const name = nameOf(item)
            const variant = variants[item.DeployID]
            return <li key={item.DeployID} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{name}</span>
                </div>
                {/* The kind goes on the second line: beside the name it would leave a phone no room for the name. */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums text-muted-foreground">
                  <span>{variant ? t("admin.exTest.runningVariant", { variant, status: statusOf(item) }) : statusOf(item)}</span>
                  {item.Kind === "static" && <Badge tone="muted">{t("admin.exTest.kindStatic")}</Badge>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <HoverTooltip text={t("admin.exTest.openLab")}>
                  <Button type="button" variant="outline" size="sm" className="w-8 p-0" aria-label={t("admin.exTest.openLabNamed", { name })}
                    onClick={() => { onClose(); router.push(testLabHref(item.ExerciseID, item.DeployID)) }}>
                    <ExternalLink aria-hidden="true" size={16} />
                  </Button>
                </HoverTooltip>
                <HoverTooltip text={t("admin.exTest.end")}>
                  <Button type="button" variant="outline" size="sm" className="w-8 p-0" aria-label={t("admin.exTest.endLabNamed", { name })}
                    onClick={() => { setError(""); setEnding(item) }}>
                    <LogOut aria-hidden="true" size={16} />
                  </Button>
                </HoverTooltip>
              </div>
            </li>
          })}
        </ul>
      </DialogContent>
    </Dialog>
    <ConfirmDialog open={ending !== null} tone="danger" busy={busy} error={error} title={t("admin.exTest.endTitle")}
      description={t(ending?.Kind === "static" ? "admin.exTest.endDescriptionStatic" : othersRunning ? "admin.exTest.endDescriptionOthers" : "admin.exTest.endDescription")} confirmLabel={t("admin.exTest.endConfirm")} busyLabel={t("admin.exTest.ending")} cancelLabel={t("admin.exPage.dialog.cancel")}
      onCancel={() => setEnding(null)} onConfirm={() => void end()} />
  </>
}
