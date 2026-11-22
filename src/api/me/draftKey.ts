import { apiPost } from "@/api/client"

/** The key of this session for sealing the secret values of the browser drafts: an id and 32 random bytes in base64. */
export type DraftKeyResponse = { ID: string; Key: string }

/**
 * POST /api/me/draft-key: the session's draft key. The same session always answers the same key; another session
 * (signed out and in again, another browser) gets another one, so its drafts cannot be opened here.
 * Not required: a 401 is thrown to the caller (no sign-in redirect), and an outage is not reported (the caller retries).
 */
export function fetchDraftKey(): Promise<DraftKeyResponse> {
  return apiPost<DraftKeyResponse>("/api/me/draft-key", {}, undefined, { required: false, silentOutage: true, retry: false })
}
