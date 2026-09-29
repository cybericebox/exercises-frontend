"use client"

import type { ReactNode } from "react"
import { HelpCircle } from "lucide-react"
import { HoverTooltip } from "@/components/ui/hover-tooltip"

/** `text` is the accessible label; `content` optionally renders a structured tooltip. */
export function FieldHelp({ text, content }: { text: string; content?: ReactNode }) {
  return <HoverTooltip text={text} content={content}>
    <button type="button" aria-label={text} className="rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
      <HelpCircle aria-hidden="true" className="h-3.5 w-3.5" />
    </button>
  </HoverTooltip>
}
