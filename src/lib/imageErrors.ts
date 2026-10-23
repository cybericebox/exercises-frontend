/**
 * imageErrors.ts — texts for the image upload and the image availability.
 *
 * Reasons come from the daemon's image registry (availability check, refused deploy, failed blob push, refused
 * upload context). The upload refusal (72801/72802) reads the same for everyone; an admin also sees the reason.
 * A refused token (72832) is not an outage: everyone reads that the registry refused access, an admin also which token.
 */
import { ApiError } from "@/api/client"
import { ImagePushError } from "@/api/exercises/images"
import { ImageArchiveError, MAX_IMAGE_ARCHIVE_BYTES } from "@/lib/imageArchive"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"
import { t } from "@/i18n/t"

const REASONS = new Set([
  "needs_event_secret", "credential_conflict", "not_configured", "unreachable", "unauthorized", "not_found", "invalid_reference", "rate_limited",
])

const ERR_REGISTRY_NOT_CONFIGURED = 72801
const ERR_REGISTRY_UNAVAILABLE = 72802
/** The registry answered but refused the platform token (401/403); context "token" is "push" or "pull". */
export const ERR_REGISTRY_ACCESS_DENIED = 72832
const TOKENS = new Set(["push", "pull"])
const IMAGE_CODE_TO_KEY: Record<number, string> = {
  22821: "exercises.image.err.sizeMismatch",
  22822: "exercises.image.err.invalidConfig",
}

/** The archive limit in GiB, as the upload UI states it. */
export const MAX_IMAGE_ARCHIVE_GIB = MAX_IMAGE_ARCHIVE_BYTES / 1024 ** 3

/** Why an image cannot be pulled, or a general line for a reason this app does not know. */
export function imageReasonText(reason: string | undefined): string {
  return reason && REASONS.has(reason) ? t(`exercises.image.reason.${reason}`) : t("exercises.image.reason.unknown")
}

function refusal(reason: string | undefined, isAdmin: boolean): string {
  return isAdmin && reason ? t("exercises.image.refusedReason", { reason: imageReasonText(reason) }) : t("exercises.image.refused")
}

type ContextBody = { Status?: { Context?: { reason?: unknown; token?: unknown } } }

/** The registry refused the platform token: the same line for everyone, an admin also reads which token. */
export function registryAccessDeniedText(error: unknown, isAdmin: boolean): string {
  const token = error instanceof ApiError ? (error.body as ContextBody | null | undefined)?.Status?.Context?.token : undefined
  return isAdmin && typeof token === "string" && TOKENS.has(token)
    ? t("exercises.image.accessDeniedToken", { token: t(`exercises.image.token.${token}`) })
    : t("exercises.image.accessDenied")
}

/**
 * The help line under a failed registry request: a configuration or access problem (72801, 72832) is fixed by an
 * administrator in «Панель платформи», not by checking the connection; null keeps the general line.
 */
export function registryErrorHelp(error: unknown): string | null {
  const code = error instanceof ApiError ? error.code : undefined
  return code === ERR_REGISTRY_NOT_CONFIGURED || code === ERR_REGISTRY_ACCESS_DENIED ? t("exercises.image.registryHelp") : null
}

/** The text of a failed image upload, or null when the user cancelled it. */
export function imageUploadErrorMessage(error: unknown, isAdmin: boolean): string | null {
  if (error instanceof DOMException && error.name === "AbortError") return null
  if (error instanceof ApiError && error.message === "Upload aborted") return null
  if (error instanceof ImageArchiveError) return t(`exercises.image.archive.${error.code}`, { size: MAX_IMAGE_ARCHIVE_GIB })
  if (error instanceof ImagePushError) {
    if (error.reason === "digest_mismatch" || error.reason === "upload_missing" || error.reason === "timeout") return t(`exercises.image.push.${error.reason}`)
    return refusal(error.reason, isAdmin)
  }
  if (error instanceof ApiError && error.code === ERR_REGISTRY_ACCESS_DENIED) return registryAccessDeniedText(error, isAdmin)
  if (error instanceof ApiError && (error.code === ERR_REGISTRY_NOT_CONFIGURED || error.code === ERR_REGISTRY_UNAVAILABLE)) {
    const reason = (error.body as ContextBody | null | undefined)?.Status?.Context?.reason
    return refusal(error.code === ERR_REGISTRY_NOT_CONFIGURED ? "not_configured" : typeof reason === "string" ? reason : undefined, isAdmin)
  }
  const key = error instanceof ApiError && error.code != null ? IMAGE_CODE_TO_KEY[error.code] : undefined
  return key ? t(key) : exerciseErrorMessage(error)
}
