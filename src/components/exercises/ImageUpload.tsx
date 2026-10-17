"use client"

import { useRef, useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { Upload } from "lucide-react"
import { t } from "@/i18n/t"
import { tRich } from "@/i18n/tRich"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form"
import { useExerciseAccess } from "@/components/shell/AccessContext"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { MAX_IMAGE_ARCHIVE_GIB } from "@/lib/imageErrors"
import { ExerciseFieldLabel } from "./ExerciseFieldLabel"
import { useExerciseId } from "./ExerciseIdContext"
import { ImageAvailability } from "./ImageAvailability"
import { useDeviceImageUpload, useImageUploads } from "./ImageUploads"

const PLATFORM_REF = /^platform:([a-z0-9]+(?:[._-][a-z0-9]+)*)@(sha256:[0-9a-f]{64})$/

/** A platform image reference split into its name and digest, or null for any other image. */
export function parsePlatformRef(image: string): { name: string; digest: string } | null {
  const match = PLATFORM_REF.exec(image.trim())
  return match ? { name: match[1], digest: match[2] } : null
}

/**
 * The device image: a reference typed by the author, or an image uploaded from a `docker save` archive (dropped
 * on the zone or picked with «Завантажити образ»). An uploaded image is the platform reference, shown as a
 * read-only chip with «Замінити». The field changes only when the upload has created the image. Below it, the
 * availability of the image.
 */
export function DeviceImageField({ variantIndex, deviceIndex, disabled, compact = false }: {
  variantIndex: number
  deviceIndex: number
  disabled: boolean
  compact?: boolean
}) {
  const form = useFormContext<DraftFormValues>()
  const { control, getValues, setValue } = form
  const base = `Variants.${variantIndex}.Topology.Devices.${deviceIndex}` as const
  const image = useWatch({ control, name: `${base}.Image` }) ?? ""
  const deviceId = useWatch({ control, name: `${base}.ID` }) ?? ""
  const exerciseId = useExerciseId()
  const isAdmin = useExerciseAccess().access?.IsAdmin ?? false
  const platform = parsePlatformRef(image)
  const fileRef = useRef<HTMLInputElement | null>(null)
  // The upload lives in the editor's store, keyed by the device id: collapsing the section or switching panels does not stop it.
  const { store, canWrite } = useImageUploads()
  const { progress, error, failedFile, dropped } = useDeviceImageUpload(store, deviceId)
  const [dragging, setDragging] = useState(false)
  const canUpload = !disabled && exerciseId !== null
  const uploading = progress !== null

  function upload(file: File) {
    if (!canUpload || uploading || exerciseId === null) return
    const variantId = getValues(`Variants.${variantIndex}.ID`) ?? ""
    void store.start({ deviceId, variantId, file, exerciseId, isAdmin, form })
  }

  function cancel() {
    store.cancel(deviceId)
  }

  function onPicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = "" // the same archive can be picked again
    if (file) upload(file)
  }

  // The zone always takes the drag, so a dropped archive is never opened by the browser; it says "none" when it cannot upload.
  function onDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = canUpload ? "copy" : "none"
    if (canUpload) setDragging(true)
  }

  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    if (!canUpload) return
    const file = event.dataTransfer?.files?.[0]
    if (file) upload(file)
  }

  const fileInput = <input ref={fileRef} data-testid="image-file-input" type="file" accept=".tar,application/x-tar" aria-hidden="true" tabIndex={-1}
    className="hidden" onChange={onPicked} />

  return <div className="min-w-0 space-y-2">
    <FormField control={control} name={`${base}.Image`} render={({ field, fieldState }) => (
      <FormItem className={compact ? "space-y-1" : undefined}>
        <ExerciseFieldLabel labelKey="admin.exTopo.image" helpKey="admin.exTopo.imageHelp" form />
        {platform ? (
          <div data-platform-image role="group" aria-label={t("exercises.image.platform")} className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-muted px-2.5 py-1.5 text-sm">
              <span className="truncate font-medium">{platform.name}</span>
              <code className="shrink-0 font-mono text-xs text-muted-foreground">{platform.digest.slice(0, "sha256:".length + 12)}</code>
            </span>
            {!disabled && <>
              <Button type="button" variant="outline" size="sm" disabled={!canUpload || uploading} onClick={() => fileRef.current?.click()}>
                {t("exercises.image.replace")}
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={uploading} onClick={() => setValue(`${base}.Image`, "", { shouldDirty: true })}>
                {t("exercises.image.useReference")}
              </Button>
              {fileInput}
            </>}
          </div>
        ) : (
          <FormControl><Input {...field} disabled={disabled} placeholder={t("admin.exTopo.imagePlaceholder")} /></FormControl>
        )}
        {(fieldState.error || !compact) && <FormMessage className={compact ? "leading-5" : "min-h-5 leading-5"} />}
      </FormItem>
    )} />

    {!platform && !disabled && !uploading && <div data-testid="image-drop-zone"
      onDragOver={onDragOver}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`flex min-w-0 flex-col gap-2 rounded-md border border-border p-3 ${dragging ? "bg-muted" : ""}`}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={!canUpload} onClick={() => fileRef.current?.click()}>
          <Upload className="mr-1 h-4 w-4" aria-hidden="true" />
          {t("exercises.image.upload")}
        </Button>
        {fileInput}
      </div>
      {exerciseId === null
        ? <p className="text-xs text-muted-foreground">{t("exercises.image.saveFirst")}</p>
        : <p className="text-xs text-muted-foreground">
          {dragging ? t("exercises.image.dropHere") : tRich("exercises.image.uploadHint", {
            size: MAX_IMAGE_ARCHIVE_GIB,
            command: <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">{t("exercises.image.command")}</code>,
          })}
        </p>}
    </div>}

    {progress && <div className="space-y-1.5" aria-live="polite">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        {progress.stage === "pushing"
          ? <span className="flex items-center gap-1.5"><Spinner size="sm" /><span>{t("exercises.image.pushing")}</span></span>
          : <span>{t("exercises.image.uploading")}</span>}
        <span className="flex items-center gap-2">
          {progress.stage === "uploading" && <span>{t("exercises.image.percent", { percent: progress.percent })}</span>}
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={cancel}>{t("exercises.image.cancel")}</Button>
        </span>
      </div>
      <div role="progressbar" aria-label={t(progress.stage === "pushing" ? "exercises.image.pushing" : "exercises.image.uploading")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}
        className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary transition-[width] duration-150" style={{ width: `${progress.percent}%` }} />
      </div>
    </div>}

    {dropped && <p className="text-xs text-muted-foreground">{t("exercises.image.changedDuringUpload")}</p>}

    {error && <div className="flex flex-wrap items-center gap-2 text-sm text-destructive" role="alert">
      <span>{error}</span>
      {failedFile && canUpload && <button type="button" className="underline" onClick={() => upload(failedFile)}>{t("admin.exFiles.retry")}</button>}
    </div>}

    <ImageAvailability variantIndex={variantIndex} deviceIndex={deviceIndex} enabled={canWrite} />
  </div>
}
