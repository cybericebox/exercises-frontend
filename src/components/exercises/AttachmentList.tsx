"use client"

import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState, type DragEvent } from "react"
import { useFieldArray, useFormContext, useWatch } from "react-hook-form"
import { Download, Paperclip, Pencil, Upload } from "lucide-react"
import { t } from "@/i18n/t"
import { Spinner } from "@/components/ui/spinner"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { uploadExerciseAttachment } from "@/api/exercises/files"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { cn } from "@/utils/cn"
import { ConfirmRemoveAction as RemoveAction } from "./ConfirmRemoveAction"
import { AttachmentDownload, useAttachmentDownload } from "./AttachmentDownload"
import { useExerciseId } from "./ExerciseIdContext"

/**
 * AttachmentList — task attachments. Upload: a hash lookup on the task (a known file is
 * attached without sending bytes), else POST /api/exercises/files; size limit is enforced by the backend (ErrFileTooLarge →
 * i18n dictionary). The files themselves don't live in the form — only {FileID, Name}; a rename changes the Name
 * only (the draft save keeps it), never the file.
 */
export type AttachmentListHandle = { upload: (file: File) => Promise<void> }

/** Why a file name cannot be used, or null: not empty, no slashes, not another file's name in this subtask. */
export function attachmentNameError(name: string, others: string[]): string | null {
  const value = name.trim()
  if (!value) return t("admin.exFiles.nameRequired")
  if (/[/\\]/.test(value)) return t("admin.exFiles.nameSlash")
  if (others.some((other) => other.trim().toLowerCase() === value.toLowerCase())) return t("admin.exFiles.nameDuplicate")
  return null
}

/** The part of a name before its extension (the whole name without one): what a rename preselects. */
function baseNameEnd(name: string): number {
  const dot = name.lastIndexOf(".")
  return dot > 0 ? dot : name.length
}

const ACTION = "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary pointer-coarse:h-11 pointer-coarse:w-11"

/** One file row: its name (a click renames it) and, on hover or focus (always on touch), rename, download, remove. */
function FileRow({ file, index, others, editing, onEdit, onRename, onRemove }: {
  file: { FileID: string; Name: string }
  index: number
  others: string[]
  editing: boolean
  onEdit: (editing: boolean) => void
  onRename: (name: string) => void
  onRemove: () => void
}) {
  const { download, busy, error: downloadError } = useAttachmentDownload(file)
  const inputRef = useRef<HTMLInputElement>(null)
  const errorId = useId()
  const [draft, setDraft] = useState(file.Name)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!editing) return
    const input = inputRef.current
    input?.focus()
    input?.setSelectionRange(0, baseNameEnd(file.Name))
  }, [editing, file.Name])

  function start() { setDraft(file.Name); setError(null); onEdit(true) }
  function save() {
    const problem = attachmentNameError(draft, others)
    if (problem) { setError(problem); return }
    if (draft.trim() !== file.Name) onRename(draft.trim())
    onEdit(false)
  }
  function cancel() { setError(null); onEdit(false) }

  const renameLabel = t("admin.exFiles.renameNamed", { name: file.Name })
  return <li className="subtask-filebar group" data-testid="attachment-row">
    {editing
      ? <div className="min-w-0 flex-1">
        <input ref={inputRef} className="subtask-file-input" value={draft} aria-label={t("admin.exFiles.nameN", { n: index + 1 })}
          aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}
          onChange={(event) => { setDraft(event.target.value); if (error) setError(null) }}
          onBlur={save} onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); save() }
            if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel() }
          }} />
        {error && <p id={errorId} role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
      : <button type="button" className="subtask-file-name" aria-label={renameLabel} onClick={start}><span className="truncate">{file.Name}</span></button>}
    {!editing && <span className="subtask-file-actions">
      <HoverTooltip text={t("admin.exFiles.rename")}>
        <button type="button" className={ACTION} aria-label={renameLabel} onClick={start}><Pencil aria-hidden="true" className="h-4 w-4" /></button>
      </HoverTooltip>
      <HoverTooltip text={t("admin.exFiles.download")}>
        <button type="button" className={ACTION} aria-label={t(busy ? "admin.exFiles.downloading" : "admin.exTest.downloadFile", { name: file.Name })} aria-busy={busy || undefined} disabled={busy}
          onClick={() => void download()}>{busy ? <Spinner size="sm" /> : <Download aria-hidden="true" className="h-4 w-4" />}</button>
      </HoverTooltip>
      <RemoveAction ariaLabel={t("admin.exFiles.remove")} onClick={onRemove} className="h-8 w-8 pointer-coarse:h-11 pointer-coarse:w-11" />
    </span>}
    {downloadError && <p role="alert" className="basis-full px-3 pb-1 text-xs text-destructive">{downloadError}</p>}
  </li>
}

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
  const files = useWatch({ control, name }) ?? []
  const exerciseId = useExerciseId()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [failedFile, setFailedFile] = useState<File | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [dragDepth, setDragDepth] = useState(0)

  async function upload(file: File) {
    if (disabled || uploading) return
    setUploading(true)
    setProgress(0)
    setError(null)
    setFailedFile(null)
    try {
      const uploaded = await uploadExerciseAttachment(exerciseId, file, setProgress)
      const next = [...getValues(name), { FileID: uploaded.FileID, Name: uploaded.Name }]
      setValue(name, next, { shouldDirty: true })
      // The new file opens in rename mode: its name can be fixed at once.
      setEditing(next.length - 1)
    } catch (err) {
      setError(exerciseErrorMessage(err))
      setFailedFile(file)
    } finally {
      setUploading(false)
      setProgress(null)
    }
  }

  async function uploadAll(list: File[]) {
    for (const file of list) await upload(file)
  }

  useImperativeHandle(ref, () => ({ upload }))

  async function onPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    e.target.value = "" // allow picking the same file again
    await uploadAll(picked)
  }

  const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files")
  const pick = () => fileRef.current?.click()
  const dropping = dragDepth > 0 && !disabled
  return (
    <div className={cn("subtask-files", dropping && "subtask-files-dropping")} data-testid="attachments-drop-zone"
      onDragEnter={(event) => { if (!disabled && hasFiles(event)) { event.preventDefault(); setDragDepth((depth) => depth + 1) } }}
      onDragLeave={(event) => { if (hasFiles(event)) setDragDepth((depth) => Math.max(0, depth - 1)) }}
      onDragOver={(event) => { if (!disabled && hasFiles(event)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy" } }}
      onDrop={(event) => {
        if (disabled || !hasFiles(event)) return
        event.preventDefault()
        event.stopPropagation()
        setDragDepth(0)
        void uploadAll(Array.from(event.dataTransfer.files ?? []))
      }}>
      <div className="subtask-section-title">
        <Paperclip aria-hidden="true" className="h-4 w-4" />
        <span>{t("admin.exFiles.title")}</span>
        {!disabled && <input ref={fileRef} data-testid="attachment-file-input" type="file" multiple className="hidden" onChange={onPicked} />}
      </div>

      {fields.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {fields.map((field, ai) => disabled
            ? <li key={field.id} className="subtask-filebar"><AttachmentDownload file={files[ai] ?? field} /></li>
            : <FileRow key={field.id} file={files[ai] ?? field} index={ai} editing={editing === ai}
              others={files.filter((_, other) => other !== ai).map((file) => file.Name)}
              onEdit={(on) => setEditing(on ? ai : null)}
              onRename={(next) => setValue(`${name}.${ai}.Name`, next, { shouldDirty: true })}
              onRemove={() => { remove(ai); setEditing(null) }} />)}
        </ul>
      )}
      {!disabled && (uploading
        ? <div className="subtask-drop" aria-live="polite">
          <span className="inline-flex items-center gap-2"><Spinner size="sm" />{t("admin.exFiles.uploadingProgress", { percent: progress ?? 0 })}</span>
          <div role="progressbar" aria-label={t("admin.exFiles.uploading")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? 0} className="h-1.5 w-40 overflow-hidden rounded-sm bg-secondary"><div className="h-full bg-primary transition-[width] duration-150" style={{ width: `${progress ?? 0}%` }} /></div>
        </div>
        : <button type="button" className="subtask-drop" aria-label={t("admin.exFiles.upload")} onClick={pick}>
          <Upload aria-hidden="true" className="h-4 w-4" />
          <span>{t(dropping ? "admin.exFiles.dropHere" : "admin.exFiles.dropOrPick")}</span>
        </button>)}
      {error && <div className="flex items-center gap-2 text-sm text-destructive" role="alert">
        <span>{error}</span>
        {failedFile && !disabled && <button type="button" className="underline" onClick={() => { void upload(failedFile) }}>{t("admin.exFiles.retry")}</button>}
      </div>}
      {disabled && fields.length === 0 && <p className="text-sm text-muted-foreground">{t("admin.exFiles.none")}</p>}
    </div>
  )
})
