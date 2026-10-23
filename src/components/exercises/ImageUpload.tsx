"use client"

import { useRef, useState, type ReactNode } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { Check, Clock, FileArchive, Link2, RefreshCw, TriangleAlert, Upload, X } from "lucide-react"
import { t } from "@/i18n/t"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form"
import { useExerciseAccess } from "@/components/shell/AccessContext"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { withOwnImage } from "@/lib/linkedVariants"
import { formatBytes } from "@/lib/formatBytes"
import { MAX_IMAGE_ARCHIVE_GIB } from "@/lib/imageErrors"
import { pluralKey } from "@/lib/presetLabels"
import { cn } from "@/utils/cn"
import { ExerciseFieldLabel } from "./ExerciseFieldLabel"
import { GuideLink } from "./GuideLink"
import { ImageAvailability } from "./ImageAvailability"
import { useDeviceImageUpload, useImageUploads, type ImageUploadProgress } from "./ImageUploads"

const PLATFORM_REF = /^platform:([a-z0-9]+(?:[._-][a-z0-9]+)*)@(sha256:[0-9a-f]{64})$/

/** A platform image reference split into its name and digest, or null for any other image. */
export function parsePlatformRef(image: string): { name: string; digest: string } | null {
  const match = PLATFORM_REF.exec(image.trim())
  return match ? { name: match[1], digest: match[2] } : null
}

/** A small icon button with the name as its aria-label and tooltip. */
function IconButton({ label, onClick, disabled, children, className }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode; className?: string }) {
  return <HoverTooltip text={label}><button type="button" aria-label={label} disabled={disabled} onClick={onClick}
    className={cn("inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50", className)}>
    {children}
  </button></HoverTooltip>
}

const CONTROL = "flex min-h-9 w-full pointer-coarse:min-h-11 min-w-0 flex-wrap items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm text-foreground transition-colors"

/** The note under the field for the stage of a running upload. */
function stageNote(progress: ImageUploadProgress): string | null {
  const { stage, detail } = progress
  if (stage === "unpacking") return t("exercises.image.stage.unpacking")
  if (stage === "compressing" && detail?.layer && detail.layers) return t("exercises.image.stage.compressing", { layer: detail.layer, layers: detail.layers })
  if (stage === "uploading" && detail?.total !== undefined && detail.sent !== undefined && detail.original !== undefined) {
    return t("exercises.image.stage.sent", { sent: formatBytes(detail.sent), total: formatBytes(detail.total), original: formatBytes(detail.original) })
  }
  return null
}

/**
 * The device image: ONE field. Type a reference, or upload a `docker save` archive (.tar or .tar.gz) with the
 * trailing icon button or by dropping it on the field. An uploaded image is the platform reference, shown as a
 * chip with «Замінити» and «Вказати посилання». The field changes only when the upload has created the image.
 * An archive dropped before the task has a name is kept and checked at once; it is sent by itself when the task
 * exists (see ImageUploadStore). Below the field: the stage, the error and the availability of the image.
 */
export function DeviceImageField({ variantIndex, deviceIndex, disabled, compact = false, baseVariantIndex }: {
  variantIndex: number
  deviceIndex: number
  disabled: boolean
  compact?: boolean
  /**
   * Set for a linked variant: its base's position. The image is the only own part of the device there: a reference
   * (no upload — the upload belongs to the device of the base), marked «власний образ» with × back to the base's.
   */
  baseVariantIndex?: number
}) {
  const form = useFormContext<DraftFormValues>()
  const { control, getValues, setValue } = form
  const base = `Variants.${variantIndex}.Topology.Devices.${deviceIndex}` as const
  const image = useWatch({ control, name: `${base}.Image` }) ?? ""
  const deviceId = useWatch({ control, name: `${base}.ID` }) ?? ""
  const isAdmin = useExerciseAccess().access?.IsAdmin ?? false
  const platform = parsePlatformRef(image)
  const fileRef = useRef<HTMLInputElement | null>(null)
  // The upload lives in the editor's store, keyed by the device id: switching panels or devices does not stop it.
  const { store, canWrite, focusName } = useImageUploads()
  const { progress, error, failedFile, dropped, queued, fileName } = useDeviceImageUpload(store, deviceId)
  const [dragging, setDragging] = useState(false)
  const linked = baseVariantIndex !== undefined
  const baseDevices = useWatch({ control, name: `Variants.${baseVariantIndex ?? variantIndex}.Topology.Devices` })
  const baseImage = linked ? baseDevices?.find((device) => device.ID === deviceId)?.Image ?? "" : ""
  const overrides = useWatch({ control, name: `Variants.${variantIndex}.ImageOverrides` })
  const ownImage = linked && Boolean(overrides?.some((override) => override.DeviceID === deviceId))
  /** A linked variant records the typed image as its own (or drops it when it is the base's again). */
  function setLinkedImage(next: string) {
    setValue(`Variants.${variantIndex}.ImageOverrides`, withOwnImage(getValues(`Variants.${variantIndex}.ImageOverrides`), deviceId, next, baseImage), { shouldDirty: true })
  }
  const canUpload = !disabled && !linked
  const uploading = progress !== null

  function upload(file: File) {
    if (!canUpload || uploading) return
    const variantId = getValues(`Variants.${variantIndex}.ID`) ?? ""
    void store.submit({ deviceId, variantId, file, isAdmin, form })
  }

  function onPicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = "" // the same archive can be picked again
    if (file) upload(file)
  }

  // The field always takes the drag, so a dropped archive is never opened by the browser; it says "none" when it cannot upload.
  function onDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = canUpload && !uploading ? "copy" : "none"
    if (canUpload && !uploading) setDragging(true)
  }

  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    setDragging(false)
    const file = event.dataTransfer?.files?.[0]
    if (file) upload(file)
  }

  const pick = () => fileRef.current?.click()
  const fileInput = <input ref={fileRef} data-testid="image-file-input" type="file" accept=".tar,.gz,.tgz,application/x-tar,application/gzip" aria-hidden="true" tabIndex={-1}
    className="hidden" onChange={onPicked} />
  const label = <ExerciseFieldLabel labelKey="admin.exTopo.image" helpLines={[t("admin.exTopo.imageHelp", { size: MAX_IMAGE_ARCHIVE_GIB })]} form />
  const dropText = <><Upload aria-hidden="true" className="h-4 w-4" />{t("exercises.image.dropHere")}</>

  /** The control and what sits under it, by state. */
  let control_: ReactNode
  let under: ReactNode = null

  if (progress) {
    const pushing = progress.stage === "pushing"
    const note = stageNote(progress)
    control_ = <div className={cn(CONTROL, "border-border")}>
      {pushing ? <Spinner size="sm" /> : <FileArchive aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />}
      <span className="min-w-0 flex-1 truncate">{pushing ? t("exercises.image.pushing") : fileName}</span>
      {!pushing && <span className="font-mono text-xs tabular-nums text-muted-foreground">{t("exercises.image.percent", { percent: progress.percent })}</span>}
      <IconButton label={t("exercises.image.cancelUpload")} onClick={() => store.cancel(deviceId)}><X aria-hidden="true" className="h-4 w-4" /></IconButton>
      {!pushing && <div role="progressbar" aria-label={t("exercises.image.uploading")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}
        className="h-1 basis-full overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary transition-[width] duration-150" style={{ width: `${progress.percent}%` }} />
      </div>}
    </div>
    under = <p aria-live="polite" className="mt-1.5 text-xs text-muted-foreground">{note}</p>
  } else if (queued) {
    const checking = queued.status === "checking"
    control_ = <div data-queued-image className={cn(CONTROL, "border-border")}>
      {checking
        ? <Spinner size="sm" />
        : <HoverTooltip text={t("exercises.image.queuedTip")}><span className="inline-flex text-[var(--ib-warn)]"><Clock aria-hidden="true" className="h-4 w-4" /></span></HoverTooltip>}
      <span className="min-w-0 flex-1 truncate">{queued.file.name}</span>
      <span className="text-xs text-muted-foreground">{checking ? t("exercises.image.checking") : <span className="font-mono tabular-nums">{formatBytes(queued.file.size)}</span>}</span>
      <IconButton label={t("exercises.image.removeFile")} onClick={() => store.unqueue(deviceId)}><X aria-hidden="true" className="h-4 w-4" /></IconButton>
    </div>
    under = checking ? null : <>
      <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
        <Check aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ib-ok)]" />
        <span>{queued.layers === null ? t("exercises.image.checkedGzip") : t("exercises.image.checked", { layers: t(pluralKey("exercises.image.layers", queued.layers), { count: queued.layers }) })}</span>
      </p>
      <div role="status" data-name-prompt className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md bg-[var(--ib-warn-bg)] px-2.5 py-2 text-sm">
        <Clock aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--ib-warn)]" />
        <span className="min-w-0 flex-1">{t("exercises.image.needName")}</span>
        <Button type="button" size="sm" onClick={focusName}>{t("exercises.image.enterName")}</Button>
      </div>
    </>
  } else if (platform) {
    control_ = <div data-platform-image role="group" aria-label={t("exercises.image.platform")} className={cn(CONTROL, "border-border")}>
      <HoverTooltip text={t("exercises.image.doneTip")}><span className="inline-flex text-[var(--ib-ok)]"><Check aria-hidden="true" className="h-4 w-4" /></span></HoverTooltip>
      <span className="min-w-0 flex-1 truncate font-medium">{platform.name}</span>
      <code className="shrink-0 font-mono text-xs text-muted-foreground">{platform.digest.slice(0, "sha256:".length + 12)}</code>
      {!disabled && <>
        {canUpload && <IconButton label={t("exercises.image.replaceTip")} onClick={pick}><RefreshCw aria-hidden="true" className="h-4 w-4" /></IconButton>}
        <IconButton label={t("exercises.image.referenceTip")} onClick={() => { if (linked) setLinkedImage(""); setValue(`${base}.Image`, "", { shouldDirty: true }) }}><Link2 aria-hidden="true" className="h-4 w-4" /></IconButton>
      </>}
    </div>
  } else if (failedFile) {
    control_ = <div data-failed-image className={cn(CONTROL, "border-destructive")}>
      <TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0 text-destructive" />
      <span className="min-w-0 flex-1 truncate">{failedFile.name}</span>
      {canUpload && <IconButton label={t("exercises.image.retryTip")} onClick={() => upload(failedFile)}><RefreshCw aria-hidden="true" className="h-4 w-4" /></IconButton>}
      <IconButton label={t("exercises.image.removeFile")} onClick={() => store.dismissError(deviceId)}><X aria-hidden="true" className="h-4 w-4" /></IconButton>
    </div>
  } else {
    control_ = null
  }

  return <div data-testid="image-drop-zone" className="min-w-0" onDragOver={onDragOver} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
    <FormField control={control} name={`${base}.Image`} render={({ field, fieldState }) => (
      <FormItem className={compact ? "space-y-1" : undefined}>
        <div className="flex items-center gap-1">{label}<GuideLink topic="obrazy" /></div>
        {dragging && canUpload && !uploading
          ? <div data-image-dropping className={cn(CONTROL, "justify-center border-dashed border-primary bg-accent font-medium")}>{dropText}</div>
          : control_ ?? <div className={cn(CONTROL, "flex-nowrap focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40", disabled && "opacity-50")}>
            <FormControl><input {...field} onChange={(event) => { if (linked) setLinkedImage(event.target.value); field.onChange(event) }} disabled={disabled} placeholder={t("admin.exTopo.imagePlaceholder")}
              className="min-w-0 flex-1 bg-transparent py-1 outline-none placeholder:text-placeholder disabled:cursor-not-allowed" /></FormControl>
            {ownImage && !disabled && <IconButton label={t("exercises.image.revertOwn", { n: (baseVariantIndex ?? 0) + 1 })}
              onClick={() => { setLinkedImage(baseImage); setValue(`${base}.Image`, baseImage, { shouldDirty: true, shouldValidate: Boolean(fieldState.error) }) }}><X aria-hidden="true" className="h-4 w-4" /></IconButton>}
            {canUpload && <IconButton label={t("exercises.image.uploadTip")} onClick={pick} className="border border-border"><Upload aria-hidden="true" className="h-4 w-4" /></IconButton>}
          </div>}
        {linked && <p data-own-image={ownImage || undefined} className={cn("text-xs", ownImage ? "font-medium text-[var(--ib-warn)]" : "text-muted-foreground")}>
          {ownImage ? t("exercises.image.own") : t("exercises.image.asInBase", { n: (baseVariantIndex ?? 0) + 1 })}</p>}
        {fieldState.error && <FormMessage className="leading-5" />}
      </FormItem>
    )} />
    {fileInput}
    {under}
    {dropped && <p className="mt-1.5 text-xs text-muted-foreground">{t("exercises.image.changedDuringUpload")}</p>}
    {error && <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs text-destructive">
      <TriangleAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{error}</span>
    </p>}
    <ImageAvailability variantIndex={variantIndex} deviceIndex={deviceIndex} enabled={canWrite} />
  </div>
}
