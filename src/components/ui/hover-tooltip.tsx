"use client"

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/utils/cn"

type Position = { left: number; top: number; below: boolean; right?: boolean }

const HOVER_DELAY = 300

// One contract (DS tooltip.css): a real mouse opens it after 300 ms, the bubble is hoverable and stays while the
// pointer is on the trigger or on it, Esc dismisses until the pointer leaves or focus moves, touch never opens it by hover.
// A label tooltip opens on keyboard focus and is not toggled by clicks (the click belongs to the control).
// help marks a field help: a tap or Enter/Space toggles it, focus does not open it, and the text always sits in aria-describedby.
// describe links the open tooltip to the child via aria-describedby; describe="always" keeps the link while it is closed
// (a control that is aria-disabled and carries a reason). truncated opens it only while the child's text is cut off by an ellipsis.
export function HoverTooltip({ text, content, children, className, describe = false, truncated = false, side = "top", help = false }: { side?: "top" | "right"; text: string; content?: ReactNode; children: ReactElement; className?: string; describe?: boolean | "always"; truncated?: boolean; help?: boolean }) {
  const id = useId()
  const [position, setPosition] = useState<Position | null>(null)
  const trigger = useRef<HTMLSpanElement>(null)
  const tooltip = useRef<HTMLDivElement>(null)
  // A click focuses the trigger; that focus must not reopen the tooltip it just closed (only keyboard focus opens it).
  const clicked = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Esc closes it for as long as the pointer stays and focus does not move.
  const dismissed = useRef(false)
  const touched = useRef(false)
  const descriptionId = `${id}-text`
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

  const clearTimer = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null } }
  const hide = () => { clearTimer(); setPosition(null) }
  useEffect(() => clearTimer, [])
  // A real mouse waits; touch never opens by hover; a synthetic event (no pointerType) opens at once.
  const hoverOpen = (type: string) => {
    if (type === "touch" || dismissed.current || position || timer.current) return
    if (type === "mouse" || type === "pen") timer.current = setTimeout(() => { timer.current = null; open() }, HOVER_DELAY)
    else open()
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
    if (!child) return
    const always = help || describe === "always"
    if (!always && (!describe || !position)) return
    child.setAttribute("aria-describedby", always ? descriptionId : id)
    return () => child.removeAttribute("aria-describedby")
  }, [describe, help, position, id, descriptionId])

  useEffect(() => {
    if (!position) return
    const close = () => setPosition(null)
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node
      if (event.pointerType === "touch") return
      if (!trigger.current?.contains(target) && !tooltip.current?.contains(target)) close()
    }
    // A tap outside closes a tap-opened bubble.
    const closeOnTapOutside = (event: PointerEvent) => {
      const target = event.target as Node
      if (event.pointerType === "touch" && !trigger.current?.contains(target) && !tooltip.current?.contains(target)) close()
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      dismissed.current = true
      close()
    }
    const closeOnWindowExit = (event: PointerEvent) => {
      if (!event.relatedTarget) close()
    }
    document.addEventListener("pointermove", closeOutside, true)
    document.addEventListener("pointerdown", closeOnTapOutside, true)
    document.addEventListener("keydown", closeOnEscape)
    window.addEventListener("pointerout", closeOnWindowExit, true)
    window.addEventListener("blur", close)
    document.addEventListener("visibilitychange", close)
    window.addEventListener("scroll", close, true)
    window.addEventListener("resize", close)
    return () => {
      document.removeEventListener("pointermove", closeOutside, true)
      document.removeEventListener("pointerdown", closeOnTapOutside, true)
      document.removeEventListener("keydown", closeOnEscape)
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
      onPointerEnter={(event) => { touched.current = event.pointerType === "touch"; hoverOpen(event.pointerType) }}
      onPointerLeave={(event) => {
        // Moving onto the bubble keeps it open (WCAG 1.4.13); the pointermove guard closes it once the pointer is on neither.
        if (event.relatedTarget instanceof Node && tooltip.current?.contains(event.relatedTarget)) return
        clicked.current = false; dismissed.current = false; hide()
      }}
      onMouseEnter={() => { if (!touched.current) hoverOpen("") }}
      onMouseLeave={(event) => { if (!(event.relatedTarget instanceof Node && tooltip.current?.contains(event.relatedTarget))) hide() }}
      onPointerDownCapture={(event) => {
        touched.current = event.pointerType === "touch"
        clicked.current = true
        clearTimer()
        if (!help && !touched.current) setPosition(null)
      }}
      onClick={() => {
        if (!help) return
        if (position) hide()
        else { dismissed.current = false; open() }
      }}
      onFocusCapture={() => { if (!clicked.current && !help) { dismissed.current = false; open() } }}
      onBlurCapture={() => { clicked.current = false; dismissed.current = false; hide() }}
    >{children}</span>
    {(help || describe === "always") && <span id={descriptionId} className="sr-only">{text}</span>}
    {position && createPortal(
      <div
        ref={tooltip}
        id={id}
        role="tooltip"
        className={cn("fixed z-[100] rounded-md border border-border bg-popover px-2.5 py-2 text-xs font-normal leading-relaxed text-popover-foreground", "before:absolute before:content-['']", position.right ? "before:inset-y-0 before:-left-2 before:w-2" : position.below ? "before:inset-x-0 before:-top-2 before:h-2" : "before:inset-x-0 before:-bottom-2 before:h-2", short ? "whitespace-nowrap" : "max-w-72 whitespace-pre-line")}
        style={{ left: position.left, top: position.top, maxWidth: long ? "min(27.5rem, calc(100vw - 2rem))" : undefined,
          transform: position.right ? "translate(0, -50%)" : `translate(-50%, ${position.below ? "0" : "-100%"})` }}
      >{content ?? text}</div>,
      document.body,
    )}
  </>
}
