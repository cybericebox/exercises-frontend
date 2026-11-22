"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { createExport, downloadExport, type ArchiveStage, type StoredExport } from "@/api/exercises/archive"
import { ApiError } from "@/api/client"
import { forgetDownload } from "@/api/exercises/chunkedDownload"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { PasswordInput } from "@/components/ui/password-input"
import { LoadingArea } from "@/components/ui/spinner"
import { SwitchBlock, SwitchList } from "@/components/ui/switch-block"
import { TriangleAlert } from "lucide-react"
import { toast } from "@/components/ui/toast"
import { t } from "@/i18n/t"
import { downloadBlob } from "@/lib/downloadBlob"
import { archiveErrorMessage } from "@/lib/exerciseErrors"

export function ExportDialog({ exerciseIds, onClose, onExported }: { exerciseIds: string[]; onClose: () => void; onExported?: () => void }) {
  const [includeSecrets, setIncludeSecrets] = useState(false)
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [shown, setShown] = useState(false)
  const [includeImages, setIncludeImages] = useState(false)
  const [stage, setStage] = useState<ArchiveStage | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  // The stored archive of a failed download, for the same selection and options: a retry resumes it.
  const kept = useRef<{ key: string; stored: StoredExport } | null>(null)
  function dropKept() {
    if (kept.current) forgetDownload(kept.current.stored.FileID)
    kept.current = null
  }
  useEffect(() => dropKept, [])

  // The wait for an export with images stops when the dialog goes away; the server finishes the job on its own.
  const waiting = useRef<AbortController | null>(null)
  useEffect(() => () => waiting.current?.abort(), [])
  const working = busy && stage === "working"
  const canLeave = !busy || working
  function leave() {
    waiting.current?.abort()
    onClose()
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const missing = includeSecrets && password.trim() === ""
    const mismatch = includeSecrets && !missing && password !== confirm
    setPasswordError(missing ? t("admin.exExport.passwordRequired") : null)
    setConfirmError(mismatch ? t("admin.exExport.mismatch") : null)
    if (missing || mismatch) {
      // The first wrong field takes focus, so the error is read beside it.
      window.setTimeout(() => document.getElementById(missing ? "export-password" : "export-confirm")?.focus(), 0)
      return
    }
    setBusy(true)
    setProgress(null)
    setError(null)
    setStage(null)
    const controller = new AbortController()
    waiting.current = controller
    try {
      const input = { IDs: exerciseIds, IncludeSecrets: includeSecrets, Password: includeSecrets ? password : "", ...(includeImages ? { IncludeImages: true } : {}) }
      const key = JSON.stringify(input)
      if (kept.current && kept.current.key !== key) dropKept()
      if (!kept.current) kept.current = { key, stored: await createExport(input, setStage, controller.signal) }
      // The archive is ready: the chunked download follows and is not cancelled by leaving.
      setStage(null)
      const archive = await downloadExport(kept.current.stored, exerciseIds.length, setProgress)
      kept.current = null
      downloadBlob(archive.blob, archive.filename)
      toast.success(t("admin.exExport.done"))
      onExported?.()
      onClose()
    } catch (cause) {
      if (controller.signal.aborted) return
      // A client error (the stored archive expired: 404) never gets better: the next try starts a fresh export.
      if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500 && cause.status !== 429 && cause.status !== 408) dropKept()
      setError(archiveErrorMessage(cause))
    } finally {
      setBusy(false)
      setProgress(null)
      setStage(null)
    }
  }

  const passwordId = "export-password"
  const confirmId = "export-confirm"
  return <Dialog open onOpenChange={(open) => { if (!open && canLeave) leave() }}>
    <DialogContent>
      <form noValidate onSubmit={(event) => void submit(event)} className="space-y-4">
        <DialogHeader>
          <DialogTitle>{t("ed.a.export.title")}</DialogTitle>
          <DialogDescription>{t("ed.a.export.description")}</DialogDescription>
        </DialogHeader>
        <div className="relative space-y-4">
          <div className={working ? "invisible space-y-4" : "space-y-4"}>
          <p className="text-sm text-foreground">{t("admin.exExport.count", { count: exerciseIds.length })}</p>
          <SwitchList>
            <SwitchBlock id="export-images" label={t("ed.a.export.images")} checked={includeImages} onCheckedChange={setIncludeImages} disabled={busy}
              help={{ intro: t("ed.a.export.imagesHelp"), default: t("ed.a.export.defaultOff") }} />
            <SwitchBlock id="export-secrets" label={t("ed.a.export.secrets")} checked={includeSecrets} onCheckedChange={(next) => { setIncludeSecrets(next); setPasswordError(null); setConfirmError(null) }}
              help={{ intro: t("ed.a.export.secretsHelp"), default: t("ed.a.export.defaultOff") }}>
              <div className="space-y-3">
                <div className="max-w-sm space-y-1.5">
                  <FieldLabel text={t("admin.exExport.password")} required htmlFor={passwordId} />
                  <PasswordInput id={passwordId} shown={shown} onShownChange={setShown} autoComplete="new-password" value={password} aria-invalid={passwordError ? true : undefined} aria-describedby={passwordError ? `${passwordId}-error` : undefined}
                    onChange={(event) => { setPassword(event.target.value); setPasswordError(null) }} />
                  {passwordError && <p id={`${passwordId}-error`} role="alert" className="text-xs font-medium text-destructive">{passwordError}</p>}
                </div>
                <div className="max-w-sm space-y-1.5">
                  <FieldLabel text={t("admin.exExport.confirm")} required htmlFor={confirmId} />
                  <PasswordInput id={confirmId} shown={shown} onShownChange={setShown} autoComplete="new-password" value={confirm} aria-invalid={confirmError ? true : undefined} aria-describedby={confirmError ? `${confirmId}-error` : undefined}
                    onChange={(event) => { setConfirm(event.target.value); setConfirmError(null) }} />
                  {confirmError && <p id={`${confirmId}-error`} role="alert" className="text-xs font-medium text-destructive">{confirmError}</p>}
                </div>
              </div>
            </SwitchBlock>
          </SwitchList>
          {includeSecrets
            ? <p role="note" className="text-xs text-muted-foreground">{t("ed.a.export.warnOn")}</p>
            : <div role="note" data-export-warning className="flex items-start gap-2 rounded-md border border-[var(--ib-warn)] bg-[var(--ib-warn-bg)] px-3 py-2 text-sm text-foreground">
              <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ib-warn)]" /><span>{t("ed.a.export.warnOff")}</span>
            </div>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </div>
          {working && <div className="absolute inset-0 flex items-center justify-center"><LoadingArea compact message={t("admin.exExport.working")} /></div>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={!canLeave} onClick={leave}>{t("admin.exPage.dialog.cancel")}</Button>
          {/* The busy button names the operation, with the percent while the archive comes down (as the import does). */}
          <Button type="submit" className="min-w-48" busy={busy} disabled={busy}>
            {!busy ? t("admin.exExport.submit") : progress !== null ? t("admin.exExport.progress", { percent: progress }) : t("admin.exExport.exporting")}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
