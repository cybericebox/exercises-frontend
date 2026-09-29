"use client"

import type { ReactNode } from "react"
import { HelpCircle } from "lucide-react"
import { HoverTooltip } from "@/components/ui/hover-tooltip"

/** Help lines: one sentence per block, small spacing. */
export function HelpLines({ lines }: { lines: string[] }) {
  return <div className="space-y-1">{lines.map((line) => <p key={line}>{line}</p>)}</div>
}

/**
 * «?» help. `text` alone is a one-line tooltip; `lines` render one sentence
 * per line; `content` renders a custom structure (e.g. a list). The button
 * label is the joined lines, so screen readers get the same text.
 */
export function FieldHelp({ text, lines, content }: { text?: string; lines?: string[]; content?: ReactNode }) {
  const label = text ?? lines?.join(" ") ?? ""
  return <HoverTooltip text={label} content={content ?? (lines && lines.length > 1 ? <HelpLines lines={lines} /> : undefined)}>
    <button type="button" aria-label={label} className="rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
      <HelpCircle aria-hidden="true" className="h-3.5 w-3.5" />
    </button>
  </HoverTooltip>
}
