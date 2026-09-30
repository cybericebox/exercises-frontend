"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ExternalLink, LogOut } from "lucide-react"

import { destroyDeploy, type DeployListItem } from "@/api/exercises/deploy"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { t } from "@/i18n/t"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"
import { testLabHref } from "@/lib/exerciseRoutes"
import { useExerciseNames, useVariantNumbers } from "@/lib/useExerciseNames"

/** "1:42" — hours and minutes left, rounded up; "0:00" at the end. */
export function timeLeft(expiresAt: string, now: number): string {
  const minutes = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 60000))
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`
}

/**
 * The user's running test labs: one row per lab (exercise, variant, time left) with an icon
 * button to open its test page and one to end it (after a danger confirmation). Used by the
 * navbar indicator and by the «Тест» button once the limit of running labs is reached.
 */
export function RunningLabsDialog({ open, items, now, description, onClose, onEnded }: {
  open: boolean
  items: DeployListItem[]
  now: number
  description?: string
  onClose: () => void
  /** A lab was ended here. */
  onEnded: (deployId: string) => void
}) {
  const router = useRouter()
  const names = useExerciseNames(items.map((item) => item.ExerciseID))
  const variants = useVariantNumbers(items)
  const [ending, setEnding] = useState<DeployListItem | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
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
      <DialogContent className="max-w-lg" {...(description ? {} : { "aria-describedby": undefined })}>
        <DialogHeader>
          <DialogTitle>{t("admin.exTest.runningTitle")}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <ul className="space-y-1.5">
          {items.map((item) => {
            const name = nameOf(item)
            const variant = variants[item.DeployID]
            return <li key={item.DeployID} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">{name}</div>
                <div className="text-xs tabular-nums text-muted-foreground">
                  {variant ? `${t("admin.exDraft.variant")} ${variant} · ` : ""}{t("admin.exTest.left", { time: timeLeft(item.ExpiresAt, now) })}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <HoverTooltip text={t("admin.exTest.openLab")}>
                  <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0" aria-label={t("admin.exTest.openLabNamed", { name })}
                    onClick={() => { onClose(); router.push(testLabHref(item.ExerciseID, item.DeployID)) }}>
                    <ExternalLink aria-hidden="true" size={16} />
                  </Button>
                </HoverTooltip>
                <HoverTooltip text={t("admin.exTest.end")}>
                  <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0" aria-label={t("admin.exTest.endLabNamed", { name })}
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
      description={t("admin.exTest.endDescription")} confirmLabel={t("admin.exTest.endConfirm")} cancelLabel={t("admin.exPage.dialog.cancel")}
      onCancel={() => setEnding(null)} onConfirm={() => void end()} />
  </>
}
