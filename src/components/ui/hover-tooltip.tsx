"use client"

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/utils/cn"

type Position = { left: number; top: number; below: boolean; right?: boolean }

// A tooltip is not a popover: clicks and focus must not toggle its visibility.
// describe links the open tooltip to the child via aria-describedby (the hint adds to its accessible name);
// truncated opens it only while the child's text is actually cut off by an ellipsis.
export function HoverTooltip({ text, content, children, className, describe = false, truncated = false, side = "top" }: { side?: "top" | "right"; text: string; content?: ReactNode; children: ReactElement; className?: string; describe?: boolean; truncated?: boolean }) {
  const id = useId()
  const [position, setPosition] = useState<Position | null>(null)
  const trigger = useRef<HTMLSpanElement>(null)
  const tooltip = useRef<HTMLDivElement>(null)
  // A click focuses the trigger; that focus must not reopen the tooltip it just closed (only keyboard focus opens it).
  const clicked = useRef(false)
  const long = text.length > 180
  // A short label reads on one line; it is shifted to stay inside the window instead of wrapping at its edge.
  const short = text.length <= 48 && !text.includes("\n")

  const open = () => {
    const rect = trigger.current?.getBoundingClientRect()
    if (!rect) return
    const child = trigger.current?.firstElementChild
    if (truncated && child && child.scrollWidth <= child.clientWidth) return
    if (side === "right") {
      // Beside the trigger, centred on it: it never covers what the trigger stands for.
      setPosition({ left: rect.right + 8, top: rect.top + rect.height / 2, below: false, right: true })
      return
    }
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
    const width = tooltip.current?.getBoundingClientRect().width ?? 0
    if (!anchor || !height || position.right) return
    const margin = 8
    const left = width ? Math.max(width / 2 + margin, Math.min(window.innerWidth - width / 2 - margin, position.left)) : position.left
    if (Math.abs(left - position.left) > 0.5) {
      setPosition({ ...position, left })
      return
    }
    const above = anchor.top - 8
    const below = window.innerHeight - anchor.bottom - 8
    const placeBelow = above < height && below > above
    if (placeBelow !== position.below) {
      setPosition({ ...position, top: placeBelow ? anchor.bottom + 7 : anchor.top - 7, below: placeBelow })
    }
  }, [position])

  // The trigger can move while the tooltip is open (a dialog still animating in when focus lands on its first button):
  // follow it, so the tooltip stays anchored instead of hanging where the trigger was.
  const openRef = useRef(open)
  openRef.current = open
  const isOpen = position !== null
  useEffect(() => {
    if (!isOpen) return
    let last = trigger.current?.getBoundingClientRect()
    let frame = requestAnimationFrame(function follow() {
      const rect = trigger.current?.getBoundingClientRect()
      if (rect && last && (Math.abs(rect.left - last.left) > 0.5 || Math.abs(rect.top - last.top) > 0.5)) openRef.current()
      last = rect
      frame = requestAnimationFrame(follow)
    })
    return () => cancelAnimationFrame(frame)
  }, [isOpen])

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
      onPointerLeave={() => { clicked.current = false; setPosition(null) }}
      onMouseEnter={open}
      onMouseLeave={() => setPosition(null)}
      onPointerDownCapture={() => { clicked.current = true; setPosition(null) }}
      onFocusCapture={() => { if (!clicked.current) open() }}
      onBlurCapture={() => { clicked.current = false; setPosition(null) }}
      onKeyDown={(event) => { if (event.key === "Escape") setPosition(null) }}
    >{children}</span>
    {position && createPortal(
      <div
        ref={tooltip}
        id={id}
        role="tooltip"
        className={cn("pointer-events-none fixed z-[100] rounded-md border border-border bg-popover px-2.5 py-2 text-xs font-normal leading-relaxed text-popover-foreground", short ? "whitespace-nowrap" : "max-w-72 whitespace-pre-line")}
        style={{ left: position.left, top: position.top, maxWidth: long ? "min(27.5rem, calc(100vw - 2rem))" : undefined,
          transform: position.right ? "translate(0, -50%)" : `translate(-50%, ${position.below ? "0" : "-100%"})` }}
      >{content ?? text}</div>,
      document.body,
    )}
  </>
}
