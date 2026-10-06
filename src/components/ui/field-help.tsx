"use client"

import type { ReactNode } from "react"
import { HelpCircle } from "lucide-react"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { t } from "@/i18n/t"

/** Help lines: one sentence per block, small spacing. */
export function HelpLines({ lines }: { lines: string[] }) {
  return <div className="space-y-1">{lines.map((line) => <p key={line}>{line}</p>)}</div>
}

/**
 * «?» help. `text` alone is a one-line tooltip; `lines` render one sentence
 * per line; `content` renders a custom structure (e.g. a list). The button
 * is named «Довідка»; the text lives in aria-describedby, so a long hint never becomes the label.
 * A tap or Enter/Space toggles the bubble, hover opens it after a delay, focus alone does not.
 */
export function FieldHelp({ text, lines, content }: { text?: string; lines?: string[]; content?: ReactNode }) {
  const label = text ?? lines?.join(" ") ?? ""
  return <HoverTooltip help text={label} content={content ?? (lines && lines.length > 1 ? <HelpLines lines={lines} /> : undefined)}>
    <button type="button" aria-label={t("ui.help")} className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary pointer-coarse:h-8 pointer-coarse:w-8">
      <HelpCircle aria-hidden="true" className="h-4 w-4" />
    </button>
  </HoverTooltip>
}
