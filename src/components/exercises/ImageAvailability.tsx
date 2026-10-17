"use client"

import { useEffect, useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { TriangleAlert } from "lucide-react"
import { t } from "@/i18n/t"
import { checkImages, type ImageAvailability as Availability } from "@/api/exercises/imageCheck"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { imageReasonText } from "@/lib/imageErrors"
import { useExerciseId } from "./ExerciseIdContext"

/** The check waits this long after the last change of an image. */
export const CHECK_DEBOUNCE_MS = 600
/** A check answer is reused this long (switching devices does not ask again). */
const CACHE_MS = 30_000

const cache = new Map<string, { at: number; results: Availability[] }>()

/** Tests start from an empty cache. */
export function resetImageCheckCache(): void {
  cache.clear()
}

type Checked = { key: string; results: Availability[] } | { key: string; failed: true }

/**
 * Whether the platform can pull the device's image, before any test lab starts. All images of the variant are
 * checked together (they deploy together, so two keys for one registry show as a conflict); the device shows
 * its own result. Quiet while the image is available or not checked yet; «Образ недоступний» with the reason
 * otherwise.
 */
export function ImageAvailability({ variantIndex, deviceIndex }: { variantIndex: number; deviceIndex: number }) {
  const { control } = useFormContext<DraftFormValues>()
  const exerciseId = useExerciseId()
  const devices = useWatch({ control, name: `Variants.${variantIndex}.Topology.Devices` }) ?? []
  const image = (devices[deviceIndex]?.Image ?? "").trim()
  const images = [...new Set(devices.map((device) => (device?.Image ?? "").trim()).filter(Boolean))]
  const key = exerciseId && image ? `${exerciseId}\n${images.join("\n")}` : ""
  const [checked, setChecked] = useState<Checked | null>(null)

  useEffect(() => {
    if (!key || !exerciseId) return
    const list = key.split("\n").slice(1)
    const abort = new AbortController()
    const timer = setTimeout(() => {
      const hit = cache.get(key)
      if (hit && Date.now() - hit.at < CACHE_MS) {
        setChecked({ key, results: hit.results })
        return
      }
      checkImages(exerciseId, list, abort.signal).then((results) => {
        cache.set(key, { at: Date.now(), results })
        if (!abort.signal.aborted) setChecked({ key, results })
      }, () => {
        if (!abort.signal.aborted) setChecked({ key, failed: true })
      })
    }, CHECK_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      abort.abort()
    }
  }, [key, exerciseId])

  // While a newer check runs, the last answer for this same image stays on screen: nothing blinks.
  if (!key || !checked) return null
  if ("failed" in checked) return checked.key !== key ? null : <p className="text-xs text-muted-foreground">{t("exercises.image.checkFailed")}</p>
  const result = checked.results.find((entry) => entry.Image === image)
  if (!result || result.Status !== "unavailable") return null
  return <div data-image-unavailable role="status" className="flex min-w-0 items-start gap-2 text-sm">
    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
    <div className="min-w-0 space-y-0.5">
      <p className="font-medium text-destructive">{t("exercises.image.unavailable")}</p>
      <p className="text-xs text-muted-foreground">{imageReasonText(result.Reason)}</p>
    </div>
  </div>
}
