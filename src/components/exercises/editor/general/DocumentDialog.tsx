"use client"

import { useEffect, useState } from "react"
import { Copy } from "lucide-react"
import { getDraftDocument } from "@/api/exercises/draftDocument"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadError } from "@/components/ui/load-error"
import { LoadingArea } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { t } from "@/i18n/t"
import { useEditor } from "../kit"
import { useReturnFocus } from "./useReturnFocus"

/** The block keeps its size across loading, error and the document, so nothing jumps. */
const BLOCK = "h-[min(60dvh,32rem)]"

/**
 * «Документ»: the working copy as the exercise document (YAML, schema cib-exercise/1.0), read-only. The server builds
 * it (`GET /exercises/{id}/draft/document`); it never holds secret values, and a reader who may not see answers gets it
 * without them.
 */
export function DocumentDialog({ onClose }: { onClose: () => void }) {
  const { exerciseId } = useEditor()
  const returnFocus = useReturnFocus()
  const [document, setDocument] = useState<string | null>(null)
  const [failed, setFailed] = useState<{ cause: unknown } | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!exerciseId) return
    let cancelled = false
    getDraftDocument(exerciseId)
      .then((text) => { if (!cancelled) setDocument(text) })
      .catch((cause) => { if (!cancelled) setFailed({ cause }) })
    return () => { cancelled = true }
  }, [exerciseId, attempt])

  async function copy() {
    if (document === null) return
    try {
      await navigator.clipboard.writeText(document)
      toast.success(t("ed.a.document.copied"))
    } catch {
      toast.warning(t("ed.a.document.copyFailed"))
    }
  }

  return <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
    <DialogContent className="max-w-3xl" onCloseAutoFocus={returnFocus}>
      <DialogHeader>
        <DialogTitle>{t("ed.shell.menu.documentTitle")}</DialogTitle>
        <DialogDescription>{t("ed.a.document.description")}</DialogDescription>
      </DialogHeader>
      {!exerciseId ? <EmptyState className={BLOCK} message={t("ed.a.document.unsaved")} />
        : failed ? <LoadError compact className={BLOCK} message={t("ed.a.document.loadError")} error={failed.cause} onRetry={() => { setFailed(null); setDocument(null); setAttempt((value) => value + 1) }} />
          : document === null ? <LoadingArea compact className={BLOCK} label={t("admin.loading")} />
            : <pre tabIndex={0} aria-label={t("ed.a.document.aria")} className={`${BLOCK} overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed`}>{document}</pre>}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={document === null} onClick={() => void copy()}><Copy aria-hidden="true" className="mr-1.5 h-4 w-4" />{t("ed.a.document.copy")}</Button>
        <Button type="button" onClick={onClose}>{t("ed.a.document.close")}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
