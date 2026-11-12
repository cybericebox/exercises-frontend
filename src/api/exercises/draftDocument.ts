import { apiGetBlob } from "@/api/client"

/**
 * The working copy as the exercise document (YAML of schema cib-exercise/1.0): `GET /exercises/{id}/draft/document`.
 * The body is the YAML itself (not wrapped); secret values are never in it; a reader without the right to see answers
 * gets it without them. Over 8 MiB the server answers 413 (an ApiError), never a cut document.
 */
export async function getDraftDocument(exerciseId: string): Promise<string> {
  const { blob } = await apiGetBlob(`/api/exercises/${encodeURIComponent(exerciseId)}/draft/document`)
  return blob.text()
}
