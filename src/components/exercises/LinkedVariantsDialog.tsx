"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Paperclip } from "lucide-react"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { SelectMenu } from "@/components/ui/select-menu"
import { Table, TABLE_CELL, TABLE_HEAD_CELL, TABLE_HEAD_ROW } from "@/components/ui/table"
import { exerciseFileURL, uploadExerciseAttachment } from "@/api/exercises/files"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"
import { flagCandidateErrorKey, parseFlagCandidate } from "@/lib/flagPattern"
import { baseCandidates, linkedFlagConflicts, newLinkedVariant } from "@/lib/linkedVariants"
import type { VariantFormValues } from "@/lib/exerciseSchemas"
import { RemoveAction } from "./RemoveAction"
import { useExerciseId } from "./ExerciseIdContext"

/** Most linked variants one dialog creates at once. */
export const LINKED_BULK_MAX = 50

type Attachment = { FileID: string; Name: string }
type Upload = { id: number; name: string; progress: number }
type Cell = { flag: string; files: Attachment[]; uploads: Upload[]; uploadError: string | null }
/** A new variant; cells are by subtask position, so they survive a base change for the columns that remain. */
type Row = { key: number; note: string; cells: Cell[] }

const EMPTY_CELL: Cell = { flag: "", files: [], uploads: [], uploadError: null }

function parseCount(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null
  const count = Number(text)
  return count >= 1 && count <= LINKED_BULK_MAX ? count : null
}

/**
 * LinkedVariantsDialog — creates several variants linked to one base at once. Text and topology come from the
 * base; each new variant gets only its own flags, files (uploaded in place) and note.
 */
export function LinkedVariantsDialog({ open, variants, onClose, onCreate }: {
  open: boolean
  variants: VariantFormValues[]
  onClose: () => void
  onCreate: (created: VariantFormValues[]) => void
}) {
  return <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
    <DialogContent className="max-w-[min(72rem,calc(100vw-2rem))]">
      {open && <LinkedVariantsForm variants={variants} onClose={onClose} onCreate={onCreate} />}
    </DialogContent>
  </Dialog>
}

function LinkedVariantsForm({ variants, onClose, onCreate }: {
  variants: VariantFormValues[]
  onClose: () => void
  onCreate: (created: VariantFormValues[]) => void
}) {
  const uid = useId()
  const exerciseId = useExerciseId()
  const candidates = baseCandidates(variants)
  const [baseId, setBaseId] = useState(() => candidates.length > 0 ? variants[candidates[0]].ID : "")
  const base = variants.find((variant) => variant.ID !== "" && variant.ID === baseId && !variant.LinkedTo)
  const nextKey = useRef(1)
  const newRow = (): Row => ({ key: nextKey.current++, note: "", cells: [] })
  const [rows, setRows] = useState<Row[]>(() => [newRow()])
  const [countText, setCountText] = useState("1")
  const [countError, setCountError] = useState<string | null>(null)
  const [flagErrors, setFlagErrors] = useState<Record<string, string>>({})
  const uploadSeq = useRef(0)
  // Running uploads by id, with the cell they belong to, so a dropped row or column can stop its own.
  const controllers = useRef(new Map<number, { controller: AbortController; rowKey: number; column: number }>())
  const fileInputs = useRef(new Map<string, HTMLInputElement | null>())

  // Closing the dialog stops uploads that are still running; their files are left to the media garbage collector.
  useEffect(() => {
    const running = controllers.current
    return () => { for (const { controller } of running.values()) controller.abort() }
  }, [])

  const columns = base?.Tasks ?? []
  const shownRows = rows.slice(0, parseCount(countText) ?? rows.length)
  const uploading = shownRows.some((row) => columns.some((_, column) => (row.cells[column]?.uploads.length ?? 0) > 0))

  function abortUploads(drop: (rowKey: number, column: number) => boolean) {
    for (const { controller, rowKey, column } of controllers.current.values()) if (drop(rowKey, column)) controller.abort()
  }

  function changeBase(id: string) {
    const width = variants.find((variant) => variant.ID === id)?.Tasks.length ?? 0
    // Cells carry over by position; columns the new base does not have are dropped with their uploads.
    abortUploads((_, column) => column >= width)
    setRows((current) => current.map((row) => row.cells.length > width ? { ...row, cells: row.cells.slice(0, width) } : row))
    setBaseId(id)
    setFlagErrors({})
  }

  function updateCell(rowKey: number, column: number, change: (cell: Cell) => Cell) {
    setRows((current) => current.map((row) => {
      if (row.key !== rowKey) return row
      const cells = [...row.cells]
      cells[column] = change(cells[column] ?? EMPTY_CELL)
      return { ...row, cells }
    }))
  }

  function changeCount(text: string) {
    setCountText(text)
    setCountError(null)
    const count = parseCount(text)
    if (count === null) return
    const kept = new Set(rows.slice(0, count).map((row) => row.key))
    abortUploads((rowKey) => !kept.has(rowKey))
    setRows((current) => count <= current.length ? current.slice(0, count) : [...current, ...Array.from({ length: count - current.length }, newRow)])
  }

  function changeFlag(rowKey: number, column: number, flag: string) {
    updateCell(rowKey, column, (cell) => ({ ...cell, flag }))
    setFlagErrors((current) => {
      const key = `${rowKey}:${column}`
      if (!(key in current)) return current
      const rest = { ...current }
      delete rest[key]
      return rest
    })
  }

  async function upload(rowKey: number, column: number, file: File) {
    const id = ++uploadSeq.current
    const controller = new AbortController()
    controllers.current.set(id, { controller, rowKey, column })
    updateCell(rowKey, column, (cell) => ({ ...cell, uploadError: null, uploads: [...cell.uploads, { id, name: file.name, progress: 0 }] }))
    const withoutUpload = (cell: Cell) => cell.uploads.filter((entry) => entry.id !== id)
    try {
      const uploaded = await uploadExerciseAttachment(exerciseId, file, (progress) => {
        updateCell(rowKey, column, (cell) => ({ ...cell, uploads: cell.uploads.map((entry) => entry.id === id ? { ...entry, progress } : entry) }))
      }, controller.signal)
      if (controller.signal.aborted) return
      updateCell(rowKey, column, (cell) => ({ ...cell, uploads: withoutUpload(cell), files: [...cell.files, { FileID: uploaded.FileID, Name: uploaded.Name }] }))
    } catch (error) {
      if (controller.signal.aborted) {
        updateCell(rowKey, column, (cell) => ({ ...cell, uploads: withoutUpload(cell) }))
        return
      }
      updateCell(rowKey, column, (cell) => ({ ...cell, uploads: withoutUpload(cell), uploadError: exerciseErrorMessage(error) }))
    } finally {
      controllers.current.delete(id)
    }
  }

  function create() {
    const count = parseCount(countText)
    if (count === null) {
      setCountError(t("admin.exLinked.val.count", { max: LINKED_BULK_MAX }))
      return
    }
    if (!base || uploading) return
    const shown = rows.slice(0, count)
    const errors: Record<string, string> = {}
    const created = shown.map((row, k) => newLinkedVariant(base, variants.length + k + 1, {
      Note: row.note,
      Tasks: base.Tasks.map((_, column) => {
        const cell = row.cells[column] ?? EMPTY_CELL
        const flag = cell.flag.trim()
        if (flag) {
          try { parseFlagCandidate(flag) } catch (error) { errors[`${row.key}:${column}`] = t(flagCandidateErrorKey(error)) }
        }
        return { Flag: flag ? [flag] : [], Attachments: cell.files }
      }),
    }))
    // Within one subtask a flag may not repeat among the base, its linked variants and the new rows.
    for (const { variantIndex, taskIndex } of linkedFlagConflicts([...variants, ...created])) {
      const row = shown[variantIndex - variants.length]
      if (row) errors[`${row.key}:${taskIndex}`] ??= t("admin.exLinked.val.flagDuplicate")
    }
    setFlagErrors(errors)
    if (Object.keys(errors).length > 0) return
    onCreate(created)
    onClose()
  }

  const flagLabelId = `${uid}-flag`
  const noteColumnId = `${uid}-note`
  const baseLabelId = `${uid}-base`
  const countId = `${uid}-count`
  const countErrorId = `${uid}-count-error`

  return <>
    <DialogHeader>
      <DialogTitle>{t("admin.exLinked.title")}</DialogTitle>
      <DialogDescription>{t("admin.exLinked.description")}</DialogDescription>
    </DialogHeader>
    <span id={flagLabelId} className="sr-only">{t("admin.exLinked.flag")}</span>
    <div className="flex flex-wrap items-start gap-4">
      <div className="flex min-w-48 flex-col gap-1.5">
        <span id={baseLabelId} className="text-sm font-medium text-foreground">{t("admin.exLinked.base")}</span>
        <SelectMenu aria-labelledby={baseLabelId} value={baseId}
          onChange={changeBase}
          options={candidates.map((index) => ({ value: variants[index].ID, label: t("admin.exDraft.variantN", { n: index + 1 }) }))} />
      </div>
      <div className="flex w-32 flex-col gap-1.5">
        <label htmlFor={countId} className="text-sm font-medium text-foreground">{t("admin.exLinked.count")}</label>
        <Input id={countId} type="number" inputMode="numeric" min={1} max={LINKED_BULK_MAX} step={1} value={countText}
          onChange={(event) => changeCount(event.target.value)}
          aria-invalid={countError ? true : undefined} aria-describedby={countError ? countErrorId : undefined} />
        {countError && <p id={countErrorId} className="text-xs text-destructive">{countError}</p>}
      </div>
    </div>
    <Table label={t("admin.exLinked.title")} regionClassName="max-h-[50vh] rounded-md border border-border">
      <thead>
        <tr className={TABLE_HEAD_ROW}>
          <th scope="col" className={TABLE_HEAD_CELL}><span className="sr-only">{t("admin.exLinked.variant")}</span></th>
          {columns.map((task, column) => <th key={column} scope="col" id={`${uid}-col-${column}`} className={`${TABLE_HEAD_CELL} min-w-56`}>
            {task.Name || t("admin.exTask.numbered", { n: column + 1 })}
          </th>)}
          <th scope="col" id={noteColumnId} className={`${TABLE_HEAD_CELL} min-w-56`}>{t("admin.exLinked.note")}</th>
        </tr>
      </thead>
      <tbody>
        {shownRows.map((row, k) => {
          const rowId = `${uid}-row-${row.key}`
          return <tr key={row.key} className="align-top">
            <th scope="row" id={rowId} className={`${TABLE_CELL} whitespace-nowrap text-left font-medium`}>
              {t("admin.exDraft.variantN", { n: variants.length + k + 1 })}
            </th>
            {columns.map((_, column) => {
              const cell = row.cells[column] ?? EMPTY_CELL
              const cellKey = `${row.key}:${column}`
              const flagError = flagErrors[cellKey]
              const flagErrorId = `${uid}-flag-error-${row.key}-${column}`
              const addTextId = `${uid}-add-${row.key}-${column}`
              const fileInputId = `${uid}-file-${row.key}-${column}`
              return <td key={column} className={TABLE_CELL}>
                <div className="flex flex-col gap-2">
                  <Input value={cell.flag} onChange={(event) => changeFlag(row.key, column, event.target.value)}
                    aria-labelledby={`${rowId} ${uid}-col-${column} ${flagLabelId}`}
                    aria-invalid={flagError ? true : undefined} aria-describedby={flagError ? flagErrorId : undefined}
                    className="font-mono" spellCheck={false} autoComplete="off" />
                  {flagError && <p id={flagErrorId} className="text-xs text-destructive">{flagError}</p>}
                  {cell.files.length > 0 && <ul className="space-y-1">
                    {cell.files.map((file, index) => <li key={`${file.FileID}-${index}`} className="flex min-w-0 items-center gap-2 text-sm">
                      <a href={exerciseFileURL(file.FileID)} download={file.Name} className="min-w-0 truncate text-primary hover:underline">{file.Name}</a>
                      <RemoveAction ariaLabel={t("admin.exLinked.removeFile", { name: file.Name })} className="h-7 w-7"
                        onClick={() => updateCell(row.key, column, (current) => ({ ...current, files: current.files.filter((_, i) => i !== index) }))} />
                    </li>)}
                  </ul>}
                  {cell.uploads.map((entry) => <div key={entry.id} className="space-y-1">
                    <div className="flex justify-between gap-2 text-xs text-muted-foreground"><span className="min-w-0 truncate">{entry.name}</span><span aria-hidden="true">{t("admin.exLinked.uploadProgress", { percent: entry.progress })}</span></div>
                    <div role="progressbar" aria-label={t("admin.exFiles.uploading")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={entry.progress}
                      className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-[width] duration-150" style={{ width: `${entry.progress}%` }} /></div>
                  </div>)}
                  {cell.uploadError && <p role="alert" className="text-xs text-destructive">{cell.uploadError}</p>}
                  <input ref={(element) => { fileInputs.current.set(cellKey, element) }} id={fileInputId} type="file" className="hidden" tabIndex={-1} aria-hidden="true"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      event.target.value = "" // allow picking the same file again
                      if (file) void upload(row.key, column, file)
                    }} />
                  <Button type="button" variant="outline" size="sm" className="self-start" aria-controls={fileInputId}
                    aria-labelledby={`${addTextId} ${rowId} ${uid}-col-${column}`}
                    onClick={() => fileInputs.current.get(cellKey)?.click()}>
                    <Paperclip aria-hidden="true" className="mr-1 h-4 w-4" />
                    <span id={addTextId}>{t("admin.exLinked.addFile")}</span>
                  </Button>
                </div>
              </td>
            })}
            <td className={TABLE_CELL}>
              <Textarea value={row.note} className="min-h-10"
                onChange={(event) => {
                  const note = event.target.value
                  setRows((current) => current.map((item) => item.key === row.key ? { ...item, note } : item))
                }}
                aria-labelledby={`${rowId} ${noteColumnId}`} />
            </td>
          </tr>
        })}
      </tbody>
    </Table>
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onClose}>{t("confirm.cancel")}</Button>
      <Button type="button" busy={uploading} onClick={create}>{t("admin.exLinked.create")}</Button>
    </DialogFooter>
  </>
}
