"use client"

import { useLayoutEffect, useRef } from "react"

/**
 * Where focus goes when a dialog opened from a menu closes. Radix only restores focus to a `Dialog.Trigger`, but these
 * dialogs open from a menu item, so the element that had focus is the item (about to disappear): its menu names the
 * trigger in `aria-labelledby`. Call in the dialog's component (the layout effect runs before the dialog moves focus
 * into itself) and hand `onCloseAutoFocus` to the dialog content.
 */
export function useReturnFocus(fallbackId?: string) {
  const target = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const active = document.activeElement as HTMLElement | null
    const menu = active?.closest<HTMLElement>('[role="menu"]')
    const trigger = menu ? document.getElementById(menu.getAttribute("aria-labelledby") ?? "") : null
    target.current = trigger ?? (active && active !== document.body ? active : null)
  }, [])
  return (event: Event) => {
    const element = target.current?.isConnected ? target.current : fallbackId ? document.getElementById(fallbackId) : null
    if (element) { event.preventDefault(); element.focus() }
  }
}
