"use client"

import { FieldLabel } from "@/components/ui/field-label"
import type { HelpContent } from "@/components/ui/help-content"

/** A column title of the infrastructure tables with its «?» (one label rule everywhere). */
export function TableHeadHelp({ text, help }: { text: string; help: HelpContent }) {
  return <FieldLabel as="span" text={text} help={help} className="min-h-0 whitespace-nowrap text-[length:inherit] leading-5" labelClassName="font-medium text-inherit" />
}
