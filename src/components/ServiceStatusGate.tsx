"use client"

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react"

import { CREST_SRC } from "@/components/brand/Logo"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { apiOrigin } from "@/lib/origins"
import { getServiceStatus, probeService, reportServiceAvailable, startOutageGrace, subscribeServiceStatus } from "@/lib/serviceStatus"

// A failed call is confirmed by two probes 15 s apart (see startOutageGrace), so
// a short backend restart never flashes the modal.
// Seconds between automatic tries while the outage lasts.
const BACKOFF_S = [3, 5, 10, 20, 30]

function backoff(attempt: number): number {
  return BACKOFF_S[Math.min(attempt, BACKOFF_S.length - 1)] * 1000
}

// The app root that stays rendered, dimmed and inert behind the overlay (set in app/layout.tsx).
const BEHIND = "[data-app-root]"

function OutageOverlay({ onCheck }: { onCheck: () => Promise<void> }) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const textId = useId()
  const attemptRef = useRef(0)
  const [deadline, setDeadline] = useState(() => Date.now() + backoff(0))
  const [now, setNow] = useState(() => Date.now())
  const [checking, setChecking] = useState(false)
  const checkingRef = useRef(false)

  const check = useCallback(async () => {
    if (checkingRef.current) return
    checkingRef.current = true
    setChecking(true)
    try {
      await onCheck()
    } finally {
      attemptRef.current += 1
      checkingRef.current = false
      setChecking(false)
      const at = Date.now()
      setNow(at)
      setDeadline(at + backoff(attemptRef.current))
    }
  }, [onCheck])

  // The page behind stays in the DOM, dimmed and inert; focus lives on the card.
  useEffect(() => {
    const behind = document.querySelector<HTMLElement>(BEHIND)
    behind?.classList.add("ib-service-down-behind")
    behind?.setAttribute("inert", "")
    buttonRef.current?.focus()
    return () => {
      behind?.classList.remove("ib-service-down-behind")
      behind?.removeAttribute("inert")
    }
  }, [])

  useEffect(() => {
    if (checking) return
    const id = window.setInterval(() => {
      const at = Date.now()
      setNow(at)
      if (at >= deadline) void check()
    }, 1000)
    return () => window.clearInterval(id)
  }, [checking, deadline, check])

  const seconds = Math.max(1, Math.ceil((deadline - now) / 1000))
  // Not dismissable: Esc does nothing and Tab stays on the only control.
  return <div className="ib-service-down" data-ib-service-down onKeyDown={(event) => { if (event.key === "Tab") { event.preventDefault(); buttonRef.current?.focus() } }}>
    <div className="ib-service-down__card" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={textId} tabIndex={-1}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="ib-service-down__crest" src={CREST_SRC} alt="" width={36} height={36} />
      <h2 className="ib-service-down__title" id={titleId}>{t("serviceGate.title")}</h2>
      <p className="ib-service-down__text" id={textId}>{t("serviceGate.body")}</p>
      <p className="ib-service-down__status" role="status" aria-live="polite">{checking ? t("serviceGate.checking") : t("serviceGate.nextTry", { seconds })}</p>
      <Button ref={buttonRef} type="button" variant="outline" className="mt-2 w-full" busy={checking} onClick={() => { void check() }}>{t("serviceGate.retryNow")}</Button>
    </div>
  </div>
}

/**
 * App-wide «server unavailable» overlay (DS patterns/service-down), the same as the event site's. API calls report network
 * failures and 5xx into the status store; two probes 15 s apart confirm before the
 * modal shows. The page stays rendered, dimmed and inert underneath; the overlay cannot be
 * dismissed, retries on a 3/5/10/20/30 s backoff or on «Спробувати зараз», and
 * closes by itself once the API answers.
 */
export function ServiceStatusGate() {
  const status = useSyncExternalStore(subscribeServiceStatus, getServiceStatus, () => "up" as const)

  useEffect(() => {
    if (status !== "suspect") return
    return startOutageGrace(() => probeService(apiOrigin))
  }, [status])

  const onCheck = useCallback(async () => {
    if (!await probeService(apiOrigin)) return
    reportServiceAvailable()
    // Revalidate /me and refetch the page data that failed on the current URL.
    window.location.reload()
  }, [])

  if (status !== "down") return null
  return <OutageOverlay onCheck={onCheck} />
}
