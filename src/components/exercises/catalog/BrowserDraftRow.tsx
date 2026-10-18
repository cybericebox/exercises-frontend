"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { t } from "@/i18n/t"
import { clearPendingChanges, hasDraftContent, pendingBufferKey, readPendingChanges } from "@/lib/exercisePendingBuffer"

/**
 * The unnamed new task kept in this browser (nothing on the server yet): one row above
 * the catalog table to continue or delete it.
 */
export function BrowserDraftRow({ userId }: { userId: string | null }) {
  const router = useRouter()
  const [title, setTitle] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    const pending = userId ? readPendingChanges(pendingBufferKey(userId, null)) : null
    const present = pending !== null && hasDraftContent(pending.identity, pending.draft)
    // Reading browser storage once the user is known.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTitle(present ? pending.identity.Name.trim() : null)
  }, [userId])

  if (title === null || !userId) return null

  return <>
    <div role="region" aria-label={t("admin.ex.localDraft.badge")} className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
      <span className="rounded-[4px] bg-border px-2 py-0.5 text-xs">{t("admin.ex.localDraft.badge")}</span>
      <span className="min-w-0 flex-1 truncate font-medium">{title || t("admin.ex.localDraft.untitled")}</span>
      <div className="flex shrink-0 gap-2">
        <Button type="button" size="sm" onClick={() => router.push("/new?draft=continue")}>{t("admin.ex.localDraft.continue")}</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(true)}>{t("admin.ex.localDraft.delete")}</Button>
      </div>
    </div>
    <ConfirmDialog open={confirming} tone="danger" onCancel={() => setConfirming(false)}
      title={t("admin.ex.localDraft.deleteTitle")} description={t("admin.ex.localDraft.deleteDescription")}
      confirmLabel={t("admin.ex.localDraft.delete")}
      onConfirm={() => { clearPendingChanges(pendingBufferKey(userId, null)); setConfirming(false); setTitle(null) }} />
  </>
}
