import type { TouchEvent, WheelEvent } from "react"

/**
 * Wheel and touch scrolling for a floating panel (popover, menu) rendered in a portal. An open dialog locks the page
 * scroll by cancelling wheel and touch events that start outside its own content, and a portalled panel is outside
 * it, so its list would not scroll at all. The panel keeps these events to itself: they never reach the dialog's
 * lock, and the panel's own overflow (with overscroll-behavior: contain) scrolls without moving the page.
 */
export function keepOwnScroll<E extends Element>(handlers: { onWheel?: (event: WheelEvent<E>) => void; onTouchMove?: (event: TouchEvent<E>) => void }) {
  return {
    onWheel: (event: WheelEvent<E>) => { handlers.onWheel?.(event); event.stopPropagation() },
    onTouchMove: (event: TouchEvent<E>) => { handlers.onTouchMove?.(event); event.stopPropagation() },
  }
}
