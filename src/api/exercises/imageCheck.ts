/**
 * imageCheck.ts — can the platform pull these device images?
 *
 *   POST /api/exercises/:id/images/check  {Images}  → [{Image, Status: "available"|"unavailable", Reason?}]
 *
 * The images are checked together, with the credentials of the exercise's owner event (none for a catalog
 * exercise), the way a test lab of the exercise would pull them. A deploy refused for its images answers 409
 * 72803 with the same results in Status.Context.images.
 */
import { ApiError, apiPost } from "@/api/client"

/** Why an image cannot be pulled (see the daemon's imageRegistry reasons). */
export type ImageUnavailableReason =
  | "needs_event_secret" | "credential_conflict" | "not_configured" | "unreachable" | "unauthorized" | "not_found" | "invalid_reference"

export type ImageAvailability = { Image: string; Status: "available" | "unavailable"; Reason?: ImageUnavailableReason | string }

/** FullCode of a deploy refused because some images cannot be pulled. */
export const ERR_IMAGES_UNAVAILABLE = 72803

/** Checks the distinct non-empty images; no request when there are none. */
export async function checkImages(exerciseID: string, images: string[], signal?: AbortSignal): Promise<ImageAvailability[]> {
  const distinct = [...new Set(images.map((image) => image.trim()).filter(Boolean))]
  if (distinct.length === 0) return []
  return apiPost<ImageAvailability[]>(`/api/exercises/${exerciseID}/images/check`, { Images: distinct }, { signal })
}

type ContextBody = { Status?: { Context?: { images?: unknown } } }

/** The unavailable images of a deploy refused with 72803 (empty when the context is missing), or null for any other error. */
export function unavailableImagesOf(error: unknown): ImageAvailability[] | null {
  if (!(error instanceof ApiError) || error.code !== ERR_IMAGES_UNAVAILABLE) return null
  const images = (error.body as ContextBody | null | undefined)?.Status?.Context?.images
  if (!Array.isArray(images)) return []
  return images.filter((item): item is ImageAvailability =>
    Boolean(item) && typeof item === "object" && typeof (item as ImageAvailability).Image === "string")
}
