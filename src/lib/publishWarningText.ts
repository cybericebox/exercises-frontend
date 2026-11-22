import type { PublishWarning } from "@/api/exercises/publishWarnings"
import { t } from "@/i18n/t"
import { pluralKey } from "@/lib/presetLabels"

/** The text of a publish / import warning; an unknown code falls back to its code, never to nothing. */
export function publishWarningText(warning: PublishWarning): string {
  switch (warning.Code) {
    case "attachments_in_some_variants":
      return t(pluralKey("ed.a.import.warn.attachmentsInSomeVariants", warning.WithoutFiles.length), { task: warning.Task, variants: warning.WithoutFiles.join(", ") })
    default:
      return t("ed.a.import.warn.other", { code: warning.Code })
  }
}
