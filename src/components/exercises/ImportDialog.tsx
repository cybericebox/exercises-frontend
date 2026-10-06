"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ApiError } from "@/api/client"
import { importExercises } from "@/api/exercises/archive"
import { SINGLE_REQUEST_MAX } from "@/api/exercises/files"
import type { Exercise } from "@/api/exercises/catalog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Field } from "@/components/ui/form-field"
import { PasswordInput } from "@/components/ui/password-input"
import { toast } from "@/components/ui/toast"
import { t } from "@/i18n/t"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"
import { exerciseHref } from "@/lib/exerciseRoutes"

// 400s of the upload itself (too large, wrong chunk size, damaged file, no name): not a missing password.
const UPLOAD_ERROR_CODES = new Set([21002, 21008, 21010, 21011])

export function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported?: () => void }) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [password, setPassword] = useState("")
  const [passwordNeeded, setPasswordNeeded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [imported, setImported] = useState<Exercise[] | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file) return
    setBusy(true)
    setProgress(null)
    setError(null)
    setPasswordNeeded(false)
    try {
      // A big archive goes up in chunks (progress shown); a repeated submit resumes it.
      const result = await importExercises(file, password, file.size > SINGLE_REQUEST_MAX ? setProgress : undefined)
      toast.success(t("admin.exImport.done").replace("{count}", String(result.length)))
      onImported?.()
      if (result.length === 1) {
        onClose()
        router.push(exerciseHref(result[0].ID))
        return
      }
      setImported(result)
    } catch (cause) {
      // The backend answers any unreadable archive (encrypted without/with a wrong password) with 400.
      if (cause instanceof ApiError && cause.status === 400 && !UPLOAD_ERROR_CODES.has(cause.code ?? 0)) {
        setPasswordNeeded(true)
      } else {
        setError(exerciseErrorMessage(cause))
      }
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose() }}>
    <DialogContent>
      {imported ? <>
        <DialogHeader>
          <DialogTitle>{t("admin.exImport.resultTitle")}</DialogTitle>
          <DialogDescription>{t("admin.exImport.done").replace("{count}", String(imported.length))}</DialogDescription>
        </DialogHeader>
        <ul className="max-h-[50vh] space-y-1 overflow-y-auto text-sm">
          {imported.map((exercise) => <li key={exercise.ID}>
            <Link href={exerciseHref(exercise.ID)} className="text-primary hover:underline" onClick={onClose}>{exercise.Name}</Link>
          </li>)}
        </ul>
        <DialogFooter><Button type="button" variant="outline" onClick={onClose}>{t("admin.exImport.close")}</Button></DialogFooter>
      </> : <form noValidate onSubmit={(event) => void submit(event)} className="space-y-4">
        <DialogHeader>
          <DialogTitle>{t("admin.exImport.title")}</DialogTitle>
          <DialogDescription>{t("admin.exImport.description")}</DialogDescription>
        </DialogHeader>
        <Field label={t("admin.exImport.file")} required>
          {(control) => <Input {...control} type="file" accept=".zip,application/zip" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />}
        </Field>
        <Field label={t("admin.exImport.password")} error={passwordNeeded ? t("admin.exImport.passwordNeeded") : undefined}>
          {(control) => <PasswordInput {...control} autoComplete="off" value={password} onChange={(event) => setPassword(event.target.value)} />}
        </Field>
        {busy && progress !== null && (
          <div className="space-y-1.5" aria-live="polite">
            <div className="flex justify-between gap-2 text-xs text-muted-foreground"><span>{t("admin.exFiles.uploading")}</span><span>{progress}%</span></div>
            <div role="progressbar" aria-label={t("admin.exFiles.uploading")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-[width] duration-150" style={{ width: `${progress}%` }} /></div>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t("admin.exPage.dialog.cancel")}</Button>
          <Button type="submit" disabled={busy || !file}>{t("admin.exImport.submit")}</Button>
        </DialogFooter>
      </form>}
    </DialogContent>
  </Dialog>
}
