"use client"

import { forwardRef, useImperativeHandle, useRef, useState } from "react"
import { useFieldArray, useFormContext } from "react-hook-form"
import { Paperclip, Upload } from "lucide-react"
import { t } from "@/i18n/t"
import { Spinner } from "@/components/ui/spinner"
import { uploadExerciseAttachment } from "@/api/exercises/files"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { ConfirmRemoveAction as RemoveAction } from "./ConfirmRemoveAction"
import { AttachmentDownload } from "./AttachmentDownload"
import { useExerciseId } from "./ExerciseIdContext"

/**
 * AttachmentList — task attachments. Upload: a hash lookup on the task (a known file is
 * attached without sending bytes), else POST /api/exercises/files; size limit is enforced by the backend (ErrFileTooLarge →
 * i18n dictionary). Download: a filename button (cookie-auth). The files
 * themselves don't live in the form — only {FileID, Name}.
 */
export type AttachmentListHandle = { upload: (file: File) => Promise<void> }

export const AttachmentList = forwardRef<AttachmentListHandle, {
  variantIndex: number
  taskIndex: number
  disabled: boolean
}>(function AttachmentList({
  variantIndex,
  taskIndex,
  disabled,
}, ref) {
  const { control, getValues, setValue } = useFormContext<DraftFormValues>()
  const name = `Variants.${variantIndex}.Tasks.${taskIndex}.Attachments` as const
  const { fields, remove } = useFieldArray({ control, name })
  const exerciseId = useExerciseId()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [failedFile, setFailedFile] = useState<File | null>(null)

  async function upload(file: File) {
    if (disabled || uploading) return
    setUploading(true)
    setProgress(0)
    setError(null)
    setFailedFile(null)
    try {
      const uploaded = await uploadExerciseAttachment(exerciseId, file, setProgress)
      setValue(name, [...getValues(name), { FileID: uploaded.FileID, Name: uploaded.Name }], { shouldDirty: true })
    } catch (err) {
      setError(exerciseErrorMessage(err))
      setFailedFile(file)
    } finally {
      setUploading(false)
      setProgress(null)
    }
  }

  useImperativeHandle(ref, () => ({ upload }))

  async function onPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = "" // allow picking the same file again
    if (file) await upload(file)
  }

  const pick = () => fileRef.current?.click()
  return (
    <div className="subtask-files">
      <div className="subtask-section-title">
        <Paperclip aria-hidden="true" className="h-4 w-4" />
        <span>{t("admin.exFiles.title")}</span>
        {!disabled && <input ref={fileRef} data-testid="attachment-file-input" type="file" className="hidden" onChange={onPicked} />}
      </div>

      {fields.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {fields.map((field, ai) => (
            <li key={field.id} className="subtask-filebar group">
              <AttachmentDownload file={field} />
              {!disabled && (
                <RemoveAction ariaLabel={t("admin.exFiles.remove")} onClick={() => remove(ai)}
                  className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100" />
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (uploading
        ? <div className="subtask-drop" aria-live="polite">
          <span className="inline-flex items-center gap-2"><Spinner size="sm" />{t("admin.exFiles.uploadingProgress", { percent: progress ?? 0 })}</span>
          <div role="progressbar" aria-label={t("admin.exFiles.uploading")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? 0} className="h-1.5 w-40 overflow-hidden rounded-sm bg-secondary"><div className="h-full bg-primary transition-[width] duration-150" style={{ width: `${progress ?? 0}%` }} /></div>
        </div>
        : <button type="button" className="subtask-drop" aria-label={t("admin.exFiles.upload")} onClick={pick}>
          <Upload aria-hidden="true" className="h-4 w-4" />
          <span>{t("admin.exFiles.dropOrPick")}</span>
        </button>)}
      {error && <div className="flex items-center gap-2 text-sm text-destructive" role="alert">
        <span>{error}</span>
        {failedFile && !disabled && <button type="button" className="underline" onClick={() => { void upload(failedFile) }}>{t("admin.exFiles.retry")}</button>}
      </div>}
      {disabled && fields.length === 0 && <p className="text-sm text-muted-foreground">{t("admin.exFiles.none")}</p>}
    </div>
  )
})
