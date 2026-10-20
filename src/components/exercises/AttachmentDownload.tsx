"use client"

import { useRef, useState } from "react"
import { Download } from "lucide-react"
import { apiGetBlob } from "@/api/client"
import { downloadBlob } from "@/lib/downloadBlob"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"
import { Spinner } from "@/components/ui/spinner"
import { t } from "@/i18n/t"
import { cn } from "@/utils/cn"

/** A single filename block; the download route is never a visible link target. */
export function AttachmentDownload({ file, className }: { file: { FileID: string; Name: string }; className?: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(false)
  async function download() {
    if (pending.current) return
    pending.current = true; setBusy(true); setError(null)
    try {
      const result = await apiGetBlob(`/api/exercises/files/${encodeURIComponent(file.FileID)}`)
      downloadBlob(result.blob, file.Name)
    } catch (cause) { setError(exerciseErrorMessage(cause)) }
    finally { pending.current = false; setBusy(false) }
  }
  return <div className={cn("min-w-0 flex-1", className)}>
    <button type="button" onClick={() => void download()} disabled={busy} aria-busy={busy || undefined}
      aria-label={t(busy ? "admin.exFiles.downloading" : "admin.exTest.downloadFile", { name: file.Name })}
      className="flex min-h-9 w-full min-w-0 items-center justify-between gap-3 rounded-md border border-border dark:border-[var(--ib-control)] px-3 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait">
      <span className="min-w-0 truncate">{file.Name}</span>
      {busy ? <span className="inline-flex shrink-0 items-center gap-2 text-xs text-muted-foreground">{t("admin.exFiles.downloadingShort")}<Spinner size="sm" /></span> : <Download aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />}
    </button>
    {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
  </div>
}
