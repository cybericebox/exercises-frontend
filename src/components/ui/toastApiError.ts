import { isOverloadError } from "@/api/retry"
import { t } from "@/i18n/t"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"
import { toast } from "./toast"

/** The localized API error; an overload error also offers «Спробувати ще раз» when `retry` is given. */
export function toastApiError(err: unknown, retry?: () => void) {
  toast.error(exerciseErrorMessage(err), retry && isOverloadError(err) ? { action: { label: t("error.overloaded.retry"), onClick: retry } } : undefined)
}
