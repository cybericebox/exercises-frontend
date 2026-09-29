import { t } from "@/i18n/t"
import { FieldHelp } from "@/components/ui/field-help"
import { FormLabel } from "@/components/ui/form"

/** One label treatment for required marks and contextual help in the exercise editor. */
export function ExerciseFieldLabel({ labelKey, helpKey, helpLines, required = false, form = false, htmlFor }: {
  labelKey: string
  helpKey?: string
  /** Structured help: one sentence per line (instead of helpKey). */
  helpLines?: string[]
  required?: boolean
  form?: boolean
  htmlFor?: string
}) {
  const content = <><span>{t(labelKey)}</span>{required && <>
    <span className="ml-1 text-destructive" aria-hidden="true">*</span>
    <span className="sr-only">{t("admin.ex.field.required")}</span>
  </>}</>

  return <div className="flex items-center gap-1.5">
    {form ? <FormLabel className="leading-5">{content}</FormLabel> : htmlFor
      ? <label htmlFor={htmlFor} className="text-sm font-medium leading-5 text-foreground">{content}</label>
      : <span className="text-sm font-medium leading-5 text-foreground">{content}</span>}
    {helpLines ? <FieldHelp lines={helpLines} /> : helpKey && <FieldHelp text={t(helpKey)} />}
  </div>
}
