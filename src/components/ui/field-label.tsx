"use client"

import type { ReactNode } from "react"
import { t } from "@/i18n/t"
import { cn } from "@/utils/cn"
import { FieldHelp } from "@/components/ui/field-help"
import type { HelpContent } from "@/components/ui/help-content"

/** Splits the text before its last word: `["Назва великого ", "поля"]`. */
function splitLast(text: string): [string, string] {
  const match = /^([\s\S]*?)(\S+)$/.exec(text)
  return match ? [match[1], match[2]] : ["", text]
}

/** U+2060 WORD JOINER: no line break between the last word (with its asterisk) and the «?». */
const GLUE = "⁠"

/**
 * The one label rule of the editor (H1): the label text, the asterisk attached to the text when the field is required,
 * then «?» at one small fixed distance — one inline unit on one line box. The last word, the asterisk and the «?» never
 * break apart when the label wraps; the «?» is never a separate column and never alone on a line. The help button is a
 * sibling of the label element, so it is not part of the control's accessible name and a click on it does not focus the
 * control.
 */
export function FieldLabel({ text, required = false, help, helpText, helpLines, htmlFor, id, className, labelClassName, as: Tag = "label", children }: {
  text: string
  required?: boolean
  help?: HelpContent
  /** A one-line help (when there is no structure to show). */
  helpText?: string
  /** One sentence per line. */
  helpLines?: string[]
  htmlFor?: string
  id?: string
  className?: string
  labelClassName?: string
  /** `span` for a heading or a group caption that is not bound to one control. */
  as?: "label" | "span" | "h3" | "h4"
  /** Extra inline content after the «?» (a badge). */
  children?: ReactNode
}) {
  const [lead, last] = splitLast(text)
  const hasHelp = Boolean(help || helpText || helpLines)
  const textProps = Tag === "label" && htmlFor ? { htmlFor } : {}
  return <div className={cn("min-h-6 text-sm leading-5", className)}>
    <Tag id={id} {...textProps} className={cn("inline font-medium text-foreground", labelClassName)}>
      {lead}
      <span className="whitespace-nowrap">
        {last}
        {required && <>
          <span className="text-destructive" aria-hidden="true">*</span>
          <span className="sr-only">{t("admin.ex.field.required")}</span>
        </>}
      </span>
    </Tag>
    {hasHelp && <>{GLUE}<span className="ml-1 inline-flex align-middle"><FieldHelp help={help} text={helpText} lines={helpLines} /></span></>}
    {children}
  </div>
}
