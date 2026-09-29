/**
 * exerciseErrors.ts — FullCode → i18n key dictionary for the domain errors of
 * exercise (objectCode 9) and media (objectCode 10).
 *
 * FullCode = informCode*10000 + objectCode*100 + detailCode
 * (inform: 2=InvalidData, 3=NotFound, 4=Exists, 7=Conflict).
 * Source: AP Backend internal/model/exercise/errors.go, internal/model/media/errors.go.
 * Unknown code → generic + backend Status.Message. 401/403 never reach here
 * (they're intercepted by client.ts / RBAC gates).
 */
import { ApiError } from "@/api/client"
import { t } from "@/i18n/t"

export const ERR_EXERCISE_EXISTS = 40903
export const ERR_EXERCISE_MODIFIED = 70904
export const ERR_NO_DRAFT = 70905
export const ERR_DRAFT_ALREADY_EXISTS = 70906
export const ERR_EXERCISE_ARCHIVED = 70948
export const ERR_EXERCISE_IN_USE = 70949

export const CODE_TO_KEY: Record<number, string> = {
  // exercise: not found / exists / conflicts
  30901: "admin.ex.err.notFound",
  30902: "admin.ex.err.versionNotFound",
  40903: "admin.ex.err.exists",
  70904: "admin.ex.err.modified",
  70905: "admin.ex.err.noDraft",
  70906: "admin.ex.err.draftExists",
  70907: "admin.ex.err.secretsNotConfigured",
  70948: "admin.ex.err.archived",
  70949: "admin.ex.err.inUse",
  // exercise: identity validation
  20908: "admin.ex.err.nameInvalid",
  20909: "admin.ex.err.descriptionTooLong",
  20910: "admin.ex.err.tagsInvalid",
  // exercise: structural validation
  20911: "admin.ex.err.noVariants",
  20912: "admin.ex.err.taskCountMismatch",
  20913: "admin.ex.err.taskNameInvalid",
  20914: "admin.ex.err.difficultyInvalid",
  20915: "admin.ex.err.flagInvalid",
  20916: "admin.ex.err.deviceNameInvalid",
  20946: "admin.ex.err.deviceDisplayNameInvalid",
  20917: "admin.ex.err.deviceTypeInvalid",
  20918: "admin.ex.err.interfaceInvalid",
  20919: "admin.ex.err.connectionEndpointsInvalid",
  20927: "admin.ex.err.externalInvalid",
  20928: "admin.ex.err.connectionArity",
  // exercise: publish-time graph validation
  20920: "admin.ex.err.endpointUnresolved",
  20921: "admin.ex.err.portInUse",
  20924: "admin.ex.err.flagDeviceUnresolved",
  20929: "admin.ex.err.vpnDisabled",
  20930: "admin.ex.err.internetDisabled",
  20931: "admin.ex.err.vpnGatewayInUse",
  20932: "admin.ex.err.internetGatewayInUse",
  20933: "admin.ex.err.deviceNameDuplicate",
  20944: "admin.ex.err.addressRefInvalid",
  20945: "admin.ex.err.addressRefUnreachable",
  20947: "admin.ex.err.networkDhcpInvalid",
  20937: "admin.ex.err.taskDescriptionRequired",
  // exercise: placeholders
  20925: "admin.ex.err.placeholderInvalid",
  20926: "admin.ex.err.placeholderNode",
  // media (attachments)
  31001: "admin.ex.err.fileNotFound",
  21002: "admin.ex.err.fileTooLarge",
  71003: "admin.ex.err.storageNotConfigured",
}

type EnvelopeBody = { Status?: { Code?: number; Message?: string } }

/** FullCode from the error body, or null (not an ApiError / no envelope). */
export function exerciseErrorCode(e: unknown): number | null {
  if (!(e instanceof ApiError)) return null
  const body = e.body as EnvelopeBody | null | undefined
  const code = body?.Status?.Code
  return typeof code === "number" ? code : null
}

/** Human-readable (Ukrainian) message for any exercises API error. */
export function exerciseErrorMessage(e: unknown): string {
  const code = exerciseErrorCode(e)
  if (code !== null) {
    const key = CODE_TO_KEY[code]
    if (key) return t(key)
    const message = ((e as ApiError).body as EnvelopeBody | null | undefined)?.Status?.Message
    if (message) return `${t("admin.ex.err.generic")}: ${message}`
  }
  return t("admin.ex.err.generic")
}
