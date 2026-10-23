"use client"

import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { HoverTooltip } from "@/components/ui/hover-tooltip"

/**
 * The «+ Додати …» action of an editor section, right-aligned in its header: a 36px bordered button (44px on touch).
 * When it cannot add (a limit), it stays focusable and says why in a tooltip, instead of going silently grey.
 */
export function SectionAddButton({ label, onClick, blockedReason }: { label: string; onClick: () => void; blockedReason?: string | null }) {
  const button = <Button type="button" variant="outline" size="sm" aria-disabled={blockedReason ? true : undefined}
    className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
    onClick={() => { if (!blockedReason) onClick() }}>
    <Plus aria-hidden="true" className="mr-1 h-4 w-4" />{label}
  </Button>
  return <span className="subtask-section-action">
    {blockedReason ? <HoverTooltip text={blockedReason} describe="always">{button}</HoverTooltip> : button}
  </span>
}
