"use client"

import { ChevronDown, Download } from "lucide-react"
import { useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ApiError } from "@/api/client"
import { downloadImportExample, importExercises } from "@/api/exercises/archive"
import { SINGLE_REQUEST_MAX } from "@/api/exercises/files"
import type { Exercise } from "@/api/exercises/catalog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FileInput } from "@/components/ui/file-input"
import { Field } from "@/components/ui/form-field"
import { PasswordInput } from "@/components/ui/password-input"
import { toast } from "@/components/ui/toast"
import { t } from "@/i18n/t"
import { tRich } from "@/i18n/tRich"
import { downloadBlob } from "@/lib/downloadBlob"
import { ARCHIVE_CONTENT_ERROR_CODES, archiveErrorMessage, errorContext, exerciseErrorCode, exerciseErrorMessage } from "@/lib/exerciseErrors"
import { exerciseHref } from "@/lib/exerciseRoutes"
import "@/styles/import-howto.css"

// 400s of the upload itself (too large, wrong chunk size, damaged file, no name): not a missing password.
const UPLOAD_ERROR_CODES = new Set([21002, 21008, 21010, 21011])

// File names shown in the how-to steps (identifiers of the archive format, not translatable text).
const MANIFEST = "exercise.yaml"
const FILES_DIR = "files/"
const ZIP_EXT = ".zip"

export function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported?: () => void }) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [password, setPassword] = useState("")
  const [passwordNeeded, setPasswordNeeded] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [exampleBusy, setExampleBusy] = useState(false)
  const [imported, setImported] = useState<Exercise[] | null>(null)

  async function downloadExample() {
    setExampleBusy(true)
    setError(null)
    try {
      const { blob, filename } = await downloadImportExample()
      downloadBlob(blob, filename)
    } catch (cause) {
      // 401/403 and other coded errors speak for themselves; the generic text covers the rest.
      setError(exerciseErrorCode(cause) !== null ? exerciseErrorMessage(cause) : t("admin.exImport.exampleError"))
    } finally {
      setExampleBusy(false)
    }
  }

  // A dropped file skips the picker's accept filter, so the extension is checked here for both.
  function chooseFile(next: File | null) {
    setPasswordNeeded(false)
    if (next && !next.name.toLowerCase().endsWith(".zip")) {
      setFile(null)
      setFileError(t("admin.exImport.notZip"))
      return
    }
    setFile(next)
    setFileError(null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file) return
    setBusy(true)
    setProgress(null)
    setError(null)
    setFileError(null)
    setPasswordNeeded(false)
    try {
      // A big archive goes up in chunks (progress shown); a repeated submit resumes it.
      const result = await importExercises(file, password, file.size > SINGLE_REQUEST_MAX ? setProgress : undefined)
      toast.success(t("admin.exImport.done", { count: result.length }))
      onImported?.()
      if (result.length === 1) {
        onClose()
        router.push(exerciseHref(result[0].ID))
        return
      }
      setImported(result)
    } catch (cause) {
      // Upload and archive-content validation identify the archive. A generic 400 cannot distinguish a corrupt
      // archive from a missing/wrong password, so it must not mark the password invalid.
      const code = exerciseErrorCode(cause) ?? 0
      // A publish-gate refusal of a version imported as published names its archive path ("field") too.
      if (ARCHIVE_CONTENT_ERROR_CODES.has(code) || errorContext(cause).field) {
        setFileError(archiveErrorMessage(cause))
      } else if (UPLOAD_ERROR_CODES.has(code)) {
        setFileError(exerciseErrorMessage(cause))
      } else {
        if (cause instanceof ApiError && cause.status === 400) setPasswordNeeded(true)
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
          <DialogDescription>{t("admin.exImport.done", { count: imported.length })}</DialogDescription>
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
        <div className="import-howto">
          <details className="import-howto__details">
            <summary>{t("admin.exImport.howTo")}<ChevronDown aria-hidden="true" /></summary>
            <ol className="import-howto__steps">
              <li>{t("admin.exImport.step1")}</li>
              <li>{tRich("admin.exImport.step2", { file: <code>{MANIFEST}</code> })}</li>
              <li>{tRich("admin.exImport.step3", { dir: <code>{FILES_DIR}</code>, file: <code>{MANIFEST}</code> })}</li>
              <li>{tRich("admin.exImport.step4", { zip: <code>{ZIP_EXT}</code> })}</li>
            </ol>
          </details>
          <Button type="button" variant="ghost" size="sm" className="import-howto__example" busy={exampleBusy} onClick={() => void downloadExample()}>
            {!exampleBusy && <Download aria-hidden="true" className="mr-2 h-4 w-4" />}
            {t("admin.exImport.example")}
          </Button>
        </div>
        <Field label={t("admin.exImport.file")} required error={fileError}>
          {(control) => <FileInput {...control} accept=".zip,application/zip" file={file} onFile={chooseFile} />}
        </Field>
        <Field label={t("admin.exImport.password")} hint={passwordNeeded ? t("admin.exImport.passwordNeeded") : undefined}>
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
