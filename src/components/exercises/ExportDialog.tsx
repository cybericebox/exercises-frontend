"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { createExport, downloadExport, type ArchiveStage, type StoredExport } from "@/api/exercises/archive"
import { ApiError } from "@/api/client"
import { forgetDownload } from "@/api/exercises/chunkedDownload"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/form-field"
import { PasswordInput } from "@/components/ui/password-input"
import { LoadingArea } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
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
    if (missing || mismatch) return
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

  return <Dialog open onOpenChange={(open) => { if (!open && canLeave) leave() }}>
    <DialogContent>
      <form noValidate onSubmit={(event) => void submit(event)} className="space-y-4">
        <DialogHeader>
          <DialogTitle>{t("admin.exExport.title")}</DialogTitle>
          <DialogDescription>{t("admin.exExport.description")}</DialogDescription>
        </DialogHeader>
        <div className="relative space-y-4">
          <div className={working ? "invisible space-y-4" : "space-y-4"}>
          <p className="text-sm text-foreground">{t("admin.exExport.count", { count: exerciseIds.length })}</p>
          <div className="flex items-start gap-3">
            <Switch id="export-secrets" checked={includeSecrets} onCheckedChange={setIncludeSecrets} aria-label={t("admin.exExport.secrets")} />
            <div>
              <label htmlFor="export-secrets" className="text-sm font-medium text-foreground">{t("admin.exExport.secrets")}</label>
              <p className="text-xs text-muted-foreground">{t("admin.exExport.secretsHint")}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Switch id="export-images" checked={includeImages} onCheckedChange={setIncludeImages} disabled={busy} aria-label={t("admin.exExport.images")} />
            <div>
              <label htmlFor="export-images" className="text-sm font-medium text-foreground">{t("admin.exExport.images")}</label>
              <p className="text-xs text-muted-foreground">{t("admin.exExport.imagesHint")}</p>
            </div>
          </div>
          {includeSecrets && <div className="space-y-3">
            <Field label={t("admin.exExport.password")} required error={passwordError}>
              {(control) => <PasswordInput {...control} shown={shown} onShownChange={setShown} autoComplete="new-password" value={password} onChange={(event) => { setPassword(event.target.value); setPasswordError(null) }} />}
            </Field>
            <Field label={t("admin.exExport.confirm")} required error={confirmError}>
              {(control) => <PasswordInput {...control} shown={shown} onShownChange={setShown} autoComplete="new-password" value={confirm} onChange={(event) => { setConfirm(event.target.value); setConfirmError(null) }} />}
            </Field>
            <p className="text-xs text-[var(--ib-warn)]">{t("admin.exExport.warning")}</p>
          </div>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </div>
          {working && <div className="absolute inset-0 flex items-center justify-center"><LoadingArea compact message={t("admin.exExport.working")} /></div>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={!canLeave} onClick={leave}>{t("admin.exPage.dialog.cancel")}</Button>
          {progress !== null && <span aria-live="polite" className="mr-auto self-center text-xs text-muted-foreground">{t("admin.exExport.progress", { percent: progress })}</span>}
          <Button type="submit" busy={busy} disabled={busy}>{t("admin.exExport.submit")}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
