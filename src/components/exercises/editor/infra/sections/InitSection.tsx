"use client"

import { useEffect, useRef, useState, type ReactElement } from "react"
import { Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form"
import { FileText, Maximize2, Minimize2, Plus, RefreshCw, Upload, X } from "lucide-react"
import { t } from "@/i18n/t"
import { MAX_BOOTSTRAP_DEVICE_BYTES, MAX_BOOTSTRAP_FILE_BYTES, MAX_BOOTSTRAP_FILES } from "@/api/exercises/model"
import { uploadExerciseAttachment } from "@/api/exercises/files"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { Spinner } from "@/components/ui/spinner"
import { emptyBootstrapFile } from "@/lib/editor/schemas/infra"
import { formatBytes } from "@/lib/formatBytes"
import { pluralKey } from "@/lib/presetLabels"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { cn } from "@/utils/cn"
import { useExerciseId } from "../../../ExerciseIdContext"
import { ConfirmRemoveAction } from "../../../ConfirmRemoveAction"
import { RefField } from "../../kit"
import { FieldError, fieldProps, useFieldError } from "../../fieldErrors"
import { Block, FieldGrid, InputField, SelectField, devicePath } from "../fields"
import type { SectionProps } from "./MainSection"

const textBytes = (value: string) => new TextEncoder().encode(value).length

type Expanded = { kind: "file"; index: number } | { kind: "script" } | null

/** «Ініціалізація»: what is written to the clean device before the service starts: files and a script. */
export function InitSection({ variantIndex, deviceIndex, disabled, requestVariable }: SectionProps & {
  requestVariable: (insert: (name: string) => void) => void
}) {
  const { control, getValues } = useFormContext<DraftFormValues>()
  const dp = devicePath(variantIndex, deviceIndex)
  const base = `Variants.${variantIndex}.Topology.Devices.${deviceIndex}.Bootstrap` as const
  const { fields, append, remove } = useFieldArray({ control, name: `${base}.Files` })
  const files = useWatch({ control, name: `${base}.Files` }) ?? []
  const script = useWatch({ control, name: `${base}.Script` }) ?? ""
  const exerciseId = useExerciseId()
  const [expanded, setExpanded] = useState<Expanded>(null)
  // The sizes of the uploaded files of this editing session (the form keeps only the file's id and name).
  const [sizes, setSizes] = useState<Record<string, number>>({})
  const [dragging, setDragging] = useState(false)
  const [dropError, setDropError] = useState("")
  const pendingDrops = useRef<File[]>([])
  const full = files.length >= MAX_BOOTSTRAP_FILES
  const lineCount = script === "" ? 0 : script.split("\n").length
  const total = textBytes(script) + files.reduce((sum, file) => sum + (file.From === "file" ? sizes[file.Source?.FileID ?? ""] ?? 0 : textBytes(file.Content)), 0)

  function addText() {
    append(emptyBootstrapFile())
  }

  /** Dropped files become file rows; each is checked against the limits before it is added. */
  async function addDropped(list: FileList) {
    setDropError("")
    for (const file of Array.from(list)) {
      if (getValues(`${base}.Files`).length >= MAX_BOOTSTRAP_FILES) { setDropError(t("ed.c.val.filesMax", { max: MAX_BOOTSTRAP_FILES })); return }
      if (file.size > MAX_BOOTSTRAP_FILE_BYTES) { setDropError(t("ed.c.init.fileTooBig", { name: file.name, max: formatBytes(MAX_BOOTSTRAP_FILE_BYTES) })); continue }
      append({ ...emptyBootstrapFile(), From: "file", Path: `/srv/${file.name}`, Source: null })
      pendingDrops.current.push(file)
    }
  }
  const hasFiles = (event: React.DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files")

  return <div className="space-y-5">
    <div onDragOver={(event) => { if (disabled || !hasFiles(event)) return; event.preventDefault(); setDragging(true) }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }}
      onDrop={(event) => { if (disabled || !hasFiles(event)) return; event.preventDefault(); setDragging(false); void addDropped(event.dataTransfer.files) }}
      className={cn("min-w-0 rounded-md", dragging && "outline-2 outline-dashed outline-offset-4 outline-primary")}>
      <Block title={t("ed.c.init.files")} count={fields.length} id="init-files"
        help={{ intro: [t("ed.c.h.files1"), t("ed.c.h.files2")], items: [{ term: t("ed.c.init.limits"), text: t("ed.c.init.limitsText", { file: formatBytes(MAX_BOOTSTRAP_FILE_BYTES), device: formatBytes(MAX_BOOTSTRAP_DEVICE_BYTES) }) }] }}>
        <FieldError path={`${base}.Files`} />
        {dropError && <p role="alert" className="text-xs font-medium text-destructive">{dropError}</p>}
        {total > MAX_BOOTSTRAP_DEVICE_BYTES && <p role="alert" className="text-xs font-medium text-destructive">{t("ed.c.init.deviceTooBig", { max: formatBytes(MAX_BOOTSTRAP_DEVICE_BYTES) })}</p>}
        {fields.length > 0 && <div className="space-y-3">{fields.map((field, index) => <FileRow key={field.id} base={base} dp={dp} index={index} disabled={disabled} exerciseId={exerciseId}
            sizes={sizes} total={total}
            pendingDrop={() => pendingDrops.current.shift() ?? null}
            onSize={(id, size) => setSizes((current) => ({ ...current, [id]: size }))}
            onExpand={() => setExpanded({ kind: "file", index })} onRemove={() => remove(index)} requestVariable={requestVariable} />)}</div>}
        {!disabled && <div className="flex flex-wrap gap-2">
          <label className={cn("flex h-9 min-w-[14rem] flex-1 cursor-pointer items-center gap-2 rounded-md border border-dashed border-[var(--ib-control)] bg-background px-3 text-[13px] text-muted-foreground hover:border-primary hover:text-foreground focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary", full && "pointer-events-none opacity-50")}>
            <Upload aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>{t("ed.c.init.dropZone")}</span>
            <input type="file" multiple disabled={full} aria-label={t("ed.c.init.pickFiles")} className="sr-only"
              onChange={(event) => { const chosen = event.target.files; if (chosen && chosen.length > 0) void addDropped(chosen); event.target.value = "" }} />
          </label>
          <BlockedTip reason={full ? t("ed.c.val.filesMax", { max: MAX_BOOTSTRAP_FILES }) : null}>
            <Button type="button" variant="outline" aria-disabled={full || undefined} className="gap-1.5 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              onClick={() => { if (!full) addText() }}><Plus aria-hidden="true" className="h-4 w-4" />{t("ed.c.init.addFile")}</Button>
          </BlockedTip>
        </div>}
      </Block>
    </div>
    <div className="border-t border-border pt-5"><Block title={t("ed.c.init.script")} id="init-script" count={lineCount > 0 ? t(pluralKey("ed.c.init.lines", lineCount), { count: lineCount }) : undefined}
      help={{ intro: t("ed.c.h.script"), items: [{ term: t("ed.c.h.scriptOnly"), text: t("ed.c.h.scriptOnlyText") }] }}>
      <Controller control={control} name={`${base}.Script`} render={({ field }) => {
        const props = fieldProps(`${base}.Script`, undefined)
        return <RefField {...props} variantIndex={variantIndex} value={field.value} onValueChange={field.onChange} multiline rows={6} disabled={disabled} aria-label={t("ed.c.init.script")}
          placeholder={t("ed.c.init.scriptPlaceholder")} onNewVariable={requestVariable}
          expandTool={<ExpandButton expanded={false} onClick={() => setExpanded({ kind: "script" })} />} />
      }} />
      <FieldError path={`${base}.Script`} />
      <FieldGrid>
        <InputField name={`${dp}.Bootstrap.Interpreter`} label={t("ed.c.init.interpreter")} mono disabled={disabled} placeholder={t("ed.c.ph.shell")}
          help={{ intro: t("ed.c.h.interpreter"), default: t("ed.c.h.interpreterDefault") }} />
        <InputField name={`${dp}.Bootstrap.Timeout`} label={t("ed.c.init.timeout")} mono disabled={disabled} placeholder={t("ed.c.ph.duration")}
          help={{ intro: [t("ed.c.h.timeout1"), t("ed.c.h.timeout2")] }} />
      </FieldGrid>
    </Block></div>
    <ExpandDialog expanded={expanded} base={base} files={files} disabled={disabled} requestVariable={requestVariable} onClose={() => setExpanded(null)} />
  </div>
}

function BlockedTip({ reason, children }: { reason: string | null; children: ReactElement }) {
  return reason ? <HoverTooltip text={reason} describe="always">{children}</HoverTooltip> : children
}

function ExpandButton({ expanded, onClick }: { expanded: boolean; onClick: () => void }) {
  const label = expanded ? t("ed.c.init.collapse") : t("ed.c.init.expand")
  return <HoverTooltip text={label}>
    <button type="button" aria-label={label} onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-[var(--ib-hover)] hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary">
      {expanded ? <Minimize2 aria-hidden="true" className="h-4 w-4" /> : <Maximize2 aria-hidden="true" className="h-4 w-4" />}
    </button>
  </HoverTooltip>
}

/** A text of a file or the script in a large field. */
function ExpandDialog({ expanded, base, files, disabled, requestVariable, onClose }: {
  expanded: Expanded
  base: `Variants.${number}.Topology.Devices.${number}.Bootstrap`
  files: DraftFormValues["Variants"][number]["Topology"]["Devices"][number]["Bootstrap"]["Files"]
  disabled: boolean
  requestVariable: (insert: (name: string) => void) => void
  onClose: () => void
}) {
  const { control } = useFormContext<DraftFormValues>()
  const isFile = expanded?.kind === "file"
  const path = expanded === null ? null : expanded.kind === "file" ? `${base}.Files.${expanded.index}.Content` as const : `${base}.Script` as const
  const title = expanded === null ? "" : expanded.kind === "file" ? t("ed.c.init.fileTitle", { path: files[expanded.index]?.Path || t("ed.c.init.noPath") }) : t("ed.c.init.script")
  return <Dialog open={expanded !== null} onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="max-w-4xl">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{isFile ? t("ed.c.init.fileDescription") : t("ed.c.init.scriptDescription")}</DialogDescription>
      </DialogHeader>
      {path && <Controller control={control} name={path} render={({ field }) => <RefField variantIndex={Number(base.split(".")[1])} value={field.value as string} onValueChange={field.onChange} multiline rows={20} disabled={disabled}
        aria-label={title} onNewVariable={requestVariable} placeholder={isFile ? t("ed.c.init.contentPlaceholder") : t("ed.c.init.scriptPlaceholder")} />} />}
      <DialogFooter><Button type="button" onClick={onClose}>{t("ed.c.init.back")}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}

function FileRow({ base, dp, index, disabled, exerciseId, sizes, total, pendingDrop, onSize, onExpand, onRemove, requestVariable }: {
  base: `Variants.${number}.Topology.Devices.${number}.Bootstrap`
  dp: string
  index: number
  disabled: boolean
  exerciseId: string | null
  sizes: Record<string, number>
  total: number
  pendingDrop: () => File | null
  onSize: (fileId: string, size: number) => void
  onExpand: () => void
  onRemove: () => void
  requestVariable: (insert: (name: string) => void) => void
}) {
  const { control, setValue } = useFormContext<DraftFormValues>()
  const file = useWatch({ control, name: `${base}.Files.${index}` })
  const pathBase = `${dp}.Bootstrap.Files.${index}`
  const sourceError = useFieldError(`${pathBase}.Source`)
  const [progress, setProgress] = useState<number | null>(null)
  const [uploadError, setUploadError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const fromFile = file?.From === "file"
  const n = index + 1

  async function upload(chosen: File) {
    setUploadError("")
    if (chosen.size > MAX_BOOTSTRAP_FILE_BYTES) { setUploadError(t("ed.c.init.fileTooBig", { name: chosen.name, max: formatBytes(MAX_BOOTSTRAP_FILE_BYTES) })); return }
    if (total + chosen.size > MAX_BOOTSTRAP_DEVICE_BYTES) { setUploadError(t("ed.c.init.deviceTooBig", { max: formatBytes(MAX_BOOTSTRAP_DEVICE_BYTES) })); return }
    setProgress(0)
    try {
      const uploaded = await uploadExerciseAttachment(exerciseId, chosen, setProgress)
      onSize(uploaded.FileID, chosen.size)
      setValue(`${base}.Files.${index}.Source`, { FileID: uploaded.FileID, Name: uploaded.Name }, { shouldDirty: true, shouldValidate: true })
      if (!file?.Path) setValue(`${base}.Files.${index}.Path`, `/srv/${uploaded.Name}`, { shouldDirty: true, shouldValidate: true })
    } catch {
      setUploadError(t("ed.c.init.uploadFailed"))
    } finally {
      setProgress(null)
    }
  }

  // A file dropped on the section waits in a queue; the row it created takes it when it appears.
  useEffect(() => {
    const dropped = fromFile && !file?.Source ? pendingDrop() : null
    if (!dropped) return
    const timer = window.setTimeout(() => void upload(dropped), 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the row appears
  }, [])

  const sourceOptions = [
    { value: "text", label: t("ed.c.init.sourceText"), description: t("ed.c.init.sourceTextHelp") },
    { value: "file", label: t("ed.c.init.sourceFile"), description: t("ed.c.init.sourceFileHelp") },
  ]
  const size = file?.Source ? sizes[file.Source.FileID] : undefined
  const contentId = fieldProps(`${pathBase}.Content`, undefined).id
  const sourceProps = fieldProps(`${pathBase}.Source`, sourceError)

  return <div data-file-row role="group" aria-label={t("ed.c.init.fileN", { n })} className="group min-w-0 space-y-2 rounded-lg border border-border bg-background p-2.5">
    <div className="grid grid-cols-1 items-end gap-x-3 gap-y-2 @lg:grid-cols-[minmax(0,1fr)_170px_170px_150px_36px] @lg:[&_label]:whitespace-nowrap">
      <InputField name={`${pathBase}.Path`} label={t("ed.c.init.path")} required mono disabled={disabled} placeholder={t("ed.c.ph.filePath")}
        help={{ intro: t("ed.c.h.path") }} />
      <InputField name={`${pathBase}.Owner`} label={t("ed.c.init.owner")} mono disabled={disabled} placeholder={t("ed.c.ph.owner")} help={{ intro: t("ed.c.h.owner"), default: t("ed.c.h.ownerDefault") }} />
      <InputField name={`${pathBase}.Group`} label={t("ed.c.init.group")} mono disabled={disabled} placeholder={t("ed.c.ph.owner")} help={{ intro: t("ed.c.h.group") }} />
      <InputField name={`${pathBase}.Mode`} label={t("ed.c.init.mode")} mono disabled={disabled} placeholder="0400" help={{ intro: t("ed.c.h.mode"), default: t("ed.c.h.modeDefault") }} />
      <div className="flex h-full items-end justify-end">
        {!disabled && <ConfirmRemoveAction ariaLabel={t("ed.c.init.removeN", { n })} onClick={onRemove} className="h-9 w-9"
          wrapperClassName="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100" />}
      </div>
    </div>
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <FieldLabel as="span" text={t("ed.c.init.content")} help={{ intro: t("ed.c.h.content"), items: [{ term: t("ed.c.init.sourceText"), text: t("ed.c.h.contentText") }, { term: t("ed.c.init.sourceFile"), text: t("ed.c.h.contentFile") }] }} />
        <div className="w-[6.5rem]">
          <SelectField name={`${pathBase}.From`} label={t("ed.c.init.content")} options={sourceOptions} disabled={disabled} menuClassName="w-[22rem] max-w-[90vw]" className="[&>div:first-child]:sr-only"
            onValue={(value) => { setUploadError(""); setValue(`${base}.Files.${index}.Source`, null, { shouldDirty: true }); if (value === "file") setValue(`${base}.Files.${index}.Content`, "", { shouldDirty: true }) }} />
        </div>
      </div>
      {fromFile
        ? <div className="mt-1">
          <input ref={inputRef} type="file" aria-hidden="true" tabIndex={-1} className="hidden" onChange={(event) => { const chosen = event.target.files?.[0]; event.target.value = ""; if (chosen) void upload(chosen) }} />
          {progress !== null
            ? <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm"><Spinner size="sm" /><span>{t("ed.c.init.uploading", { percent: progress })}</span></div>
            : file?.Source
              ? <div {...sourceProps} tabIndex={-1} className="flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm">
                <FileText aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate font-mono text-[13px]">{file.Source.Name}</span>
                {size !== undefined && <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(size)}</span>}
                <span className="flex-1" />
                {!disabled && <HoverTooltip text={t("ed.c.init.replaceFile")}><button type="button" aria-label={t("ed.c.init.replaceFile")} onClick={() => inputRef.current?.click()}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-[var(--ib-hover)] hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"><RefreshCw aria-hidden="true" className="h-4 w-4" /></button></HoverTooltip>}
              </div>
              : <button type="button" {...sourceProps} disabled={disabled} onClick={() => inputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); const chosen = event.dataTransfer.files[0]; if (chosen) void upload(chosen) }}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-md border border-dashed border-border bg-card text-sm text-muted-foreground hover:border-primary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50">
                <Upload aria-hidden="true" className="h-4 w-4" />{t("ed.c.init.dropFile")}
              </button>}
          <FieldError path={`${pathBase}.Source`} />
          {uploadError && <p role="alert" className="mt-1 flex items-start gap-1.5 text-xs font-medium text-destructive"><X aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />{uploadError}</p>}
        </div>
        : <div className="mt-1">
          <Controller control={control} name={`${base}.Files.${index}.Content`} render={({ field }) => <RefField id={contentId} variantIndex={Number(base.split(".")[1])} value={field.value} onValueChange={field.onChange} multiline rows={3}
            disabled={disabled} aria-label={t("ed.c.init.contentN", { n })} placeholder={t("ed.c.init.contentPlaceholder")} onNewVariable={requestVariable}
            expandTool={<ExpandButton expanded={false} onClick={onExpand} />} />} />
          <FieldError path={`${pathBase}.Content`} />
        </div>}
    </div>
  </div>
}
