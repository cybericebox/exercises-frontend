import { t } from "@/i18n/t"
import { FormLabel } from "@/components/ui/form"
import { FieldHelp } from "@/components/ui/field-help"
import { FieldLabel } from "@/components/ui/field-label"
import type { HelpContent } from "@/components/ui/help-content"

/**
 * One label treatment for required marks and contextual help in the exercise editor: text, attached asterisk and «?»
 * as one inline unit (see FieldLabel). Kept for the existing forms; new code uses FieldLabel with `help`.
 */
export function ExerciseFieldLabel({ labelKey, helpKey, helpLines, help, required = false, form = false, htmlFor }: {
  labelKey: string
  helpKey?: string
  /** One sentence per line (instead of helpKey). */
  helpLines?: string[]
  /** Structured help: intro, a line per value, the default. */
  help?: HelpContent
  required?: boolean
  form?: boolean
  htmlFor?: string
}) {
  if (!form) return <FieldLabel text={t(labelKey)} required={required} htmlFor={htmlFor} as={htmlFor ? "label" : "span"}
    help={help} helpLines={help ? undefined : helpLines} helpText={help || helpLines ? undefined : helpKey ? t(helpKey) : undefined} />
  const content = <><span>{t(labelKey)}</span>{required && <>
    <span className="text-destructive" aria-hidden="true">*</span>
    <span className="sr-only">{t("admin.ex.field.required")}</span>
  </>}</>
  return <div className="flex min-h-6 items-center gap-1">
    <FormLabel className="leading-5">{content}</FormLabel>
    {help ? <FieldHelp help={help} /> : helpLines ? <FieldHelp lines={helpLines} /> : helpKey && <FieldHelp text={t(helpKey)} />}
  </div>
}
