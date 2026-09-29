"use client"

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/utils/cn"

type Position = { left: number; top: number; below: boolean }

// A tooltip is not a popover: clicks and focus must not toggle its visibility.
// describe links the open tooltip to the child via aria-describedby (the hint adds to its accessible name);
// truncated opens it only while the child's text is actually cut off by an ellipsis.
export function HoverTooltip({ text, content, children, className, describe = false, truncated = false }: { text: string; content?: ReactNode; children: ReactElement; className?: string; describe?: boolean; truncated?: boolean }) {
  const id = useId()
  const [position, setPosition] = useState<Position | null>(null)
  const trigger = useRef<HTMLSpanElement>(null)
  const tooltip = useRef<HTMLDivElement>(null)
  const long = text.length > 180

  const open = () => {
    const rect = trigger.current?.getBoundingClientRect()
    if (!rect) return
    const child = trigger.current?.firstElementChild
    if (truncated && child && child.scrollWidth <= child.clientWidth) return
    const halfWidth = Math.min(long ? 220 : 152, window.innerWidth / 2)
    setPosition({
      left: Math.max(halfWidth, Math.min(window.innerWidth - halfWidth, rect.left + rect.width / 2)),
      top: rect.top >= 56 ? rect.top - 7 : rect.bottom + 7,
      below: rect.top < 56,
    })
  }

  useLayoutEffect(() => {
    if (!position) return
    const anchor = trigger.current?.getBoundingClientRect()
    const height = tooltip.current?.getBoundingClientRect().height ?? 0
    if (!anchor || !height) return
    const above = anchor.top - 8
    const below = window.innerHeight - anchor.bottom - 8
    const placeBelow = above < height && below > above
    if (placeBelow !== position.below) {
      setPosition({ ...position, top: placeBelow ? anchor.bottom + 7 : anchor.top - 7, below: placeBelow })
    }
  }, [position])

  useEffect(() => {
    const child = trigger.current?.firstElementChild
    if (!describe || !position || !child) return
    child.setAttribute("aria-describedby", id)
    return () => child.removeAttribute("aria-describedby")
  }, [describe, position, id])

  useEffect(() => {
    if (!position) return
    const close = () => setPosition(null)
    const closeOutside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node)) close()
    }
    const closeOnWindowExit = (event: PointerEvent) => {
      if (!event.relatedTarget) close()
    }
    document.addEventListener("pointermove", closeOutside, true)
    window.addEventListener("pointerout", closeOnWindowExit, true)
    window.addEventListener("blur", close)
    document.addEventListener("visibilitychange", close)
    window.addEventListener("scroll", close, true)
    window.addEventListener("resize", close)
    return () => {
      document.removeEventListener("pointermove", closeOutside, true)
      window.removeEventListener("pointerout", closeOnWindowExit, true)
      window.removeEventListener("blur", close)
      document.removeEventListener("visibilitychange", close)
      window.removeEventListener("scroll", close, true)
      window.removeEventListener("resize", close)
    }
  }, [position])

  return <>
    <span
      ref={trigger}
      className={cn("inline-flex", className)}
      onPointerEnter={open}
      onPointerLeave={() => setPosition(null)}
      onMouseEnter={open}
      onMouseLeave={() => setPosition(null)}
      onFocusCapture={open}
      onBlurCapture={() => setPosition(null)}
      onKeyDown={(event) => { if (event.key === "Escape") setPosition(null) }}
    >{children}</span>
    {position && createPortal(
      <div
        ref={tooltip}
        id={id}
        role="tooltip"
        className="pointer-events-none fixed z-[100] max-w-72 whitespace-pre-line rounded-md border border-border bg-popover px-2.5 py-2 text-xs font-normal leading-relaxed text-popover-foreground"
        style={{ left: position.left, top: position.top, maxWidth: long ? "min(27.5rem, calc(100vw - 2rem))" : undefined,
          transform: `translate(-50%, ${position.below ? "0" : "-100%"})` }}
      >{content ?? text}</div>,
      document.body,
    )}
  </>
}
