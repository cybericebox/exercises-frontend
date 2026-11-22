/**
 * imageService.ts — what an image itself runs (the default shown by the device editor).
 *
 *   POST /api/exercises/:id/images/service  {Images}  → [{Image, Known, Entrypoint, Cmd, User, WorkingDir}]
 *
 * One entry per distinct non-empty image, in the order sent (at most 200, each at most 512 characters). `Known: false`
 * (the other fields empty) means the platform has no start configuration for it (an image by reference to an external
 * registry, a platform image published before the configuration was kept): the editor then has no default to show, and
 * a device with bootstrap files or a script needs its own command.
 */
import { apiPost } from "@/api/client"

export type ImageService = {
  Image: string
  Known: boolean
  Entrypoint: string[]
  Cmd: string[]
  User: string
  WorkingDir: string
}

export const MAX_SERVICE_IMAGES = 200

/** The start configuration of the distinct non-empty images; no request when there are none. */
export async function getImageServices(exerciseID: string, images: string[], signal?: AbortSignal): Promise<ImageService[]> {
  const distinct = [...new Set(images.map((image) => image.trim()).filter(Boolean))].slice(0, MAX_SERVICE_IMAGES)
  if (distinct.length === 0) return []
  return apiPost<ImageService[]>(`/api/exercises/${exerciseID}/images/service`, { Images: distinct }, { signal })
}
