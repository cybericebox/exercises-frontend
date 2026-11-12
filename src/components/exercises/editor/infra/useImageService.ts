"use client"

import { useEffect, useState } from "react"
import { getImageServices, type ImageService } from "@/api/exercises/imageService"
import { useExerciseId } from "../../ExerciseIdContext"

/** The image changes while it is typed: ask after the last change. */
const DEBOUNCE_MS = 600
const CACHE_MS = 60_000
const cache = new Map<string, { at: number; value: ImageService }>()

/** Tests start from an empty cache. */
export function resetImageServiceCache(): void {
  cache.clear()
}

/**
 * What the image itself runs (entrypoint, command, user): the default the «Сервіс» section shows. null while unknown:
 * no image, an unsaved exercise (nothing to ask), the request is running or failed. `Known: false` is an answer too.
 */
export function useImageService(image: string): ImageService | null {
  const exerciseId = useExerciseId()
  const wanted = image.trim()
  const key = exerciseId && wanted ? `${exerciseId}\n${wanted}` : ""
  const [answer, setAnswer] = useState<{ key: string; value: ImageService } | null>(null)

  useEffect(() => {
    if (!key || !exerciseId) return
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < CACHE_MS) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a cached answer is applied once the key is known
      setAnswer({ key, value: hit.value })
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      getImageServices(exerciseId, [wanted], controller.signal).then((list) => {
        const value = list.find((item) => item.Image === wanted) ?? list[0]
        if (!value || controller.signal.aborted) return
        cache.set(key, { at: Date.now(), value })
        setAnswer({ key, value })
      }).catch(() => { /* the default is a hint; without it the section says the command is unknown */ })
    }, DEBOUNCE_MS)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [key, exerciseId, wanted])

  return answer && answer.key === key ? answer.value : null
}
