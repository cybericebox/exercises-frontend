"use client"

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { cn } from "@/utils/cn"

export type TopologyMenuEntry =
  | { kind: "label"; key: string; label: string }
  | { kind: "item"; key: string; label: string; onSelect: () => void; icon?: ReactNode
      danger?: boolean; disabled?: boolean; reason?: string; separated?: boolean }

const EDGE_GAP = 8

/**
 * Context menu of the topology canvas: a portal on document.body (no ancestor can
 * clip or offset it), kept inside the viewport, 1px border and no shadow.
 * Keyboard: arrows, Home/End, Enter/Space; Esc and Tab close it. Esc and a chosen
 * item return focus to the element the menu was opened on.
 */
export function TopologyContextMenu({ x, y, label, entries, onClose, returnFocus }: {
  x: number
  y: number
  label: string
  entries: TopologyMenuEntry[]
  onClose: () => void
  returnFocus?: HTMLElement | SVGElement | null
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const rect = menuRef.current?.getBoundingClientRect()
    const width = rect?.width ?? 0
    const height = rect?.height ?? 0
    const left = x + width > window.innerWidth - EDGE_GAP ? x - width : x
    const top = y + height > window.innerHeight - EDGE_GAP ? y - height : y
    setPosition({
      left: Math.max(EDGE_GAP, Math.min(left, window.innerWidth - width - EDGE_GAP)),
      top: Math.max(EDGE_GAP, Math.min(top, window.innerHeight - height - EDGE_GAP)),
    })
  }, [x, y])

  useEffect(() => {
    if (!position) return
    const list = items()
    ;(list.find((item) => !item.hasAttribute("aria-disabled")) ?? list[0])?.focus()
  }, [position])

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose()
    }
    const close = () => onClose()
    document.addEventListener("pointerdown", closeOutside, true)
    window.addEventListener("resize", close)
    window.addEventListener("blur", close)
    window.addEventListener("scroll", close, true)
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true)
      window.removeEventListener("resize", close)
      window.removeEventListener("blur", close)
      window.removeEventListener("scroll", close, true)
    }
  }, [onClose])

  function items(): HTMLElement[] {
    return Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])
  }

  function closeAndReturnFocus() {
    onClose()
    returnFocus?.focus?.()
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const list = items()
    const current = list.indexOf(document.activeElement as HTMLElement)
    const next = event.key === "ArrowDown" ? (current + 1) % list.length
      : event.key === "ArrowUp" ? (current - 1 + list.length) % list.length
      : event.key === "Home" ? 0
      : event.key === "End" ? list.length - 1 : null
    if (next !== null && list.length) {
      event.preventDefault()
      list[next]?.focus()
      return
    }
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      closeAndReturnFocus()
    } else if (event.key === "Tab") {
      event.preventDefault()
      closeAndReturnFocus()
    }
  }

  return createPortal(<div ref={menuRef} role="menu" aria-label={label} onKeyDown={onKeyDown}
    onContextMenu={(event) => event.preventDefault()}
    className="fixed z-50 max-h-[calc(100dvh-1rem)] min-w-48 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground"
    style={{ left: position?.left ?? x, top: position?.top ?? y, visibility: position ? undefined : "hidden" }}>
    {entries.map((entry) => {
      if (entry.kind === "label") {
        return <div key={entry.key} role="presentation" className="px-3 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">{entry.label}</div>
      }
      const item = <button type="button" role="menuitem" tabIndex={-1} aria-disabled={entry.disabled || undefined}
        className={cn("flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm focus:outline-none aria-disabled:cursor-not-allowed aria-disabled:opacity-40",
          entry.danger ? "text-destructive hover:bg-destructive/10 focus:bg-destructive/10" : "hover:bg-accent focus:bg-accent")}
        onClick={() => {
          if (entry.disabled) return
          closeAndReturnFocus()
          entry.onSelect()
        }}>
        {entry.icon}
        <span className="min-w-0 flex-1 truncate">{entry.label}</span>
      </button>
      return <div key={entry.key} role="none" className={entry.separated ? "mt-1 border-t border-border pt-1" : undefined}>
        {entry.disabled && entry.reason ? <HoverTooltip text={entry.reason} describe="always" className="flex w-full">{item}</HoverTooltip> : item}
      </div>
    })}
  </div>, document.body)
}
