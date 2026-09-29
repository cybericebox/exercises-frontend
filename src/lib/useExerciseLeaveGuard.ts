"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

/** Guard in-app navigation only. Reload is deliberately left alone. */
export function useExerciseLeaveGuard(shouldGuard: boolean) {
  const router = useRouter()
  const guardRef = useRef(shouldGuard)
  const [destination, setDestination] = useState<string | null>(null)
  const bypassRef = useRef(false)

  useEffect(() => { guardRef.current = shouldGuard }, [shouldGuard])

  useEffect(() => {
    // Read the location at event time: the page may swap its own address in place
    // (e.g. /new → /detail?id=… after create).
    const request = (href: string) => {
      const currentUrl = window.location.href
      const target = new URL(href, currentUrl)
      if (target.href === currentUrl || !guardRef.current || bypassRef.current) return false
      setDestination(target.origin === window.location.origin ? target.pathname + target.search + target.hash : target.href)
      return true
    }
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return
      if (request(anchor.href)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    // The Navigation API can cancel a browser Back action before Next handles it.
    // Browser support varies, so regular in-app links are also caught above.
    type NavigationEvent = Event & { destination: { url: string }; navigationType: string; canIntercept: boolean }
    const navigation = (window as Window & { navigation?: EventTarget }).navigation
    const onNavigate = (event: Event) => {
      const nav = event as NavigationEvent
      // "replace" is an in-place address swap (history.replaceState / router.replace), not leaving.
      if (nav.navigationType === "reload" || nav.navigationType === "replace" || !nav.canIntercept) return
      if (request(nav.destination.url)) event.preventDefault()
    }
    document.addEventListener("click", onClick, true)
    navigation?.addEventListener("navigate", onNavigate)
    return () => {
      document.removeEventListener("click", onClick, true)
      navigation?.removeEventListener("navigate", onNavigate)
    }
  }, [])

  const cancelLeave = () => setDestination(null)
  const allowNavigation = () => { bypassRef.current = true }
  const finishLeave = () => {
    if (!destination) return
    allowNavigation()
    if (new URL(destination, window.location.href).origin === window.location.origin) router.push(destination)
    else window.location.assign(destination)
    setDestination(null)
  }
  return { destination, cancelLeave, finishLeave, allowNavigation }
}
