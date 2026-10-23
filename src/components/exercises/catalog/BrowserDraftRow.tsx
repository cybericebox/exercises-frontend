"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { t } from "@/i18n/t"
import { clearPendingChanges, hasDraftContent, pendingBufferKey, readPendingChanges } from "@/lib/exercisePendingBuffer"

/** The title of the unsaved new-task draft kept on this device, or null when there is none. */
function readDraftTitle(userId: string | null): string | null {
  const pending = userId ? readPendingChanges(pendingBufferKey(userId, null)) : null
  return pending !== null && hasDraftContent(pending.identity, pending.draft) ? pending.identity.Name.trim() : null
}

/**
 * The unsaved new task (nothing on the server yet): a strip above the catalog table, tinted
 * with the warning colour, to continue or delete it. Re-read whenever the page is shown again.
 */
export function BrowserDraftRow({ userId }: { userId: string | null }) {
  const router = useRouter()
  const [title, setTitle] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    const refresh = () => setTitle(readDraftTitle(userId))
    // Reading browser storage once the user is known, and again when the page is shown or the storage changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
    window.addEventListener("pageshow", refresh)
    window.addEventListener("focus", refresh)
    window.addEventListener("storage", refresh)
    return () => {
      window.removeEventListener("pageshow", refresh)
      window.removeEventListener("focus", refresh)
      window.removeEventListener("storage", refresh)
    }
  }, [userId])

  if (title === null || !userId) return null

  return <>
    <div data-unsaved-draft className="catalog-strip catalog-strip-warn">
      <span className="shrink-0 rounded-[4px] bg-[var(--ib-warn)] px-2 py-0.5 text-xs font-medium text-[var(--ib-warn-bg)]">{t("admin.ex.localDraft.badge")}</span>
      <span className="min-w-0 flex-1 truncate font-medium">{title || t("admin.ex.localDraft.untitled")}</span>
      <Button type="button" size="sm" onClick={() => router.push("/new?draft=continue")}>{t("admin.ex.localDraft.continue")}</Button>
      <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(true)}>{t("admin.ex.localDraft.delete")}</Button>
    </div>
    <ConfirmDialog open={confirming} tone="danger" onCancel={() => setConfirming(false)}
      title={t("admin.ex.localDraft.deleteTitle")} description={t("admin.ex.localDraft.deleteDescription")}
      confirmLabel={t("admin.ex.localDraft.delete")}
      onConfirm={() => { clearPendingChanges(pendingBufferKey(userId, null)); setConfirming(false); setTitle(null) }} />
  </>
}
