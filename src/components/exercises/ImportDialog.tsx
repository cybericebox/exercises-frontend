"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ApiError } from "@/api/client"
import { importExercises } from "@/api/exercises/archive"
import type { Exercise } from "@/api/exercises/catalog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { toast } from "@/components/ui/toast"
import { t } from "@/i18n/t"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"
import { exerciseHref } from "@/lib/exerciseRoutes"

export function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported?: () => void }) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [password, setPassword] = useState("")
  const [passwordNeeded, setPasswordNeeded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [imported, setImported] = useState<Exercise[] | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file) return
    setBusy(true)
    setError(null)
    setPasswordNeeded(false)
    try {
      const result = await importExercises(file, password)
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
      if (cause instanceof ApiError && cause.status === 400) {
        setPasswordNeeded(true)
        setError(t("admin.exImport.passwordNeeded"))
      } else {
        setError(exerciseErrorMessage(cause))
      }
    } finally {
      setBusy(false)
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
        <div className="space-y-1.5">
          <Label htmlFor="import-file">{t("admin.exImport.file")}</Label>
          <Input id="import-file" type="file" accept=".zip,application/zip" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="import-password">{t("admin.exImport.password")}</Label>
          <PasswordInput id="import-password" autoComplete="off" value={password} aria-invalid={passwordNeeded}
            className={passwordNeeded ? "border-destructive" : undefined} onChange={(event) => setPassword(event.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t("admin.exPage.dialog.cancel")}</Button>
          <Button type="submit" disabled={busy || !file}>{t("admin.exImport.submit")}</Button>
        </DialogFooter>
      </form>}
    </DialogContent>
  </Dialog>
}
