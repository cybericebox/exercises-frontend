"use client"

import { useState, type FormEvent } from "react"
import { exportExercises } from "@/api/exercises/archive"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/form-field"
import { PasswordInput } from "@/components/ui/password-input"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/toast"
import { t } from "@/i18n/t"
import { downloadBlob } from "@/lib/downloadBlob"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"

export function ExportDialog({ exerciseIds, onClose, onExported }: { exerciseIds: string[]; onClose: () => void; onExported?: () => void }) {
  const [includeSecrets, setIncludeSecrets] = useState(false)
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [shown, setShown] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const missing = includeSecrets && password.trim() === ""
    const mismatch = includeSecrets && !missing && password !== confirm
    setPasswordError(missing ? t("admin.exExport.passwordRequired") : null)
    setConfirmError(mismatch ? t("admin.exExport.mismatch") : null)
    if (missing || mismatch) return
    setBusy(true)
    setError(null)
    try {
      const archive = await exportExercises({ IDs: exerciseIds, IncludeSecrets: includeSecrets, Password: includeSecrets ? password : "" })
      downloadBlob(archive.blob, archive.filename)
      toast.success(t("admin.exExport.done"))
      onExported?.()
      onClose()
    } catch (cause) {
      setError(exerciseErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose() }}>
    <DialogContent>
      <form noValidate onSubmit={(event) => void submit(event)} className="space-y-4">
        <DialogHeader>
          <DialogTitle>{t("admin.exExport.title")}</DialogTitle>
          <DialogDescription>{t("admin.exExport.description")}</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-foreground">{t("admin.exExport.count", { count: exerciseIds.length })}</p>
        <div className="flex items-start gap-3">
          <Switch id="export-secrets" checked={includeSecrets} onCheckedChange={setIncludeSecrets} aria-label={t("admin.exExport.secrets")} />
          <div>
            <label htmlFor="export-secrets" className="text-sm font-medium text-foreground">{t("admin.exExport.secrets")}</label>
            <p className="text-xs text-muted-foreground">{t("admin.exExport.secretsHint")}</p>
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
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t("admin.exPage.dialog.cancel")}</Button>
          <Button type="submit" disabled={busy}>{t("admin.exExport.submit")}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
