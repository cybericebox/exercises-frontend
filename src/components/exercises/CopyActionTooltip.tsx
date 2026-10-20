"use client"

import type { ReactElement } from "react"
import { HoverTooltip } from "@/components/ui/hover-tooltip"

/** Keep the cross-app copy block on each app's existing portal tooltip. */
export function CopyActionTooltip({ text, children }: { text: string; children: ReactElement }) {
  return <HoverTooltip text={text} className="shrink-0">{children}</HoverTooltip>
}
