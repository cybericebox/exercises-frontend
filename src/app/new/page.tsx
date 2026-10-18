"use client"

import { useEffect, useState } from "react"
import { ExercisePage } from "@/components/exercises/ExercisePage"
import { useReturnContext } from "@/components/shell/ReturnContext"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { LoadingArea } from "@/components/ui/spinner"
import { t } from "@/i18n/t"
import { clearPendingChanges, hasDraftContent, pendingBufferKey, readPendingChanges } from "@/lib/exercisePendingBuffer"
import { useRole } from "@/lib/useRole"

/** Query flag set by the catalog row «Продовжити»: open the browser draft without asking. */
const CONTINUE_DRAFT_PARAM = "draft"

type Gate = "checking" | "ask" | "open"

export default function NewExercisePage() {
  // /new?event=<eventID> keeps the event scope (explicit query or stored return context).
  const { eventId } = useReturnContext()
  const { me, isLoading } = useRole()
  const userId = me?.ID ?? null
  const [gate, setGate] = useState<Gate>("checking")

  useEffect(() => {
    if (isLoading) return
    const key = userId ? pendingBufferKey(userId, null) : null
    const pending = key ? readPendingChanges(key) : null
    const hasDraft = pending !== null && hasDraftContent(pending.identity, pending.draft)
    const wantsContinue = new URLSearchParams(window.location.search).get(CONTINUE_DRAFT_PARAM) === "continue"
    // Reading browser storage once the user is known.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGate(hasDraft && !wantsContinue ? "ask" : "open")
  }, [isLoading, userId])

  if (gate === "open") return <ExercisePage exerciseId={null} versionId={null} eventId={eventId} />
  if (gate === "checking") return <LoadingArea className="h-full" label={t("admin.loading")} />
  // Esc and the backdrop keep the draft; only the red button throws it away.
  return <>
    <LoadingArea className="h-full" label={t("admin.loading")} />
    <ConfirmDialog open title={t("admin.ex.localDraft.confirmTitle")} description={t("admin.ex.localDraft.confirmDescription")}
      cancelLabel={t("admin.ex.localDraft.resume")} confirmLabel={t("admin.ex.localDraft.startNew")} tone="danger"
      onCancel={() => setGate("open")}
      onConfirm={() => { if (userId) clearPendingChanges(pendingBufferKey(userId, null)); setGate("open") }} />
  </>
}
