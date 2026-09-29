"use client"

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react"

import { CREST_SRC } from "@/components/brand/Logo"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { apiOrigin } from "@/lib/origins"
import { confirmServiceUnavailable, getServiceStatus, probeService, reportServiceAvailable, subscribeServiceStatus } from "@/lib/serviceStatus"
import "./ServiceStatusGate.css"

// A failed call is confirmed by one probe before the modal shows, so a single
// flaky request does not cover the page; the modal shows only when the probe
// itself fails.
const CONFIRM_MS = 3000
// Seconds between automatic tries while the outage lasts.
const BACKOFF_S = [3, 5, 10, 20, 30]

function backoff(attempt: number): number {
  return BACKOFF_S[Math.min(attempt, BACKOFF_S.length - 1)] * 1000
}

function OutageDialog({ onCheck }: { onCheck: () => Promise<void> }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
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

  useEffect(() => {
    const dialog = ref.current
    if (!dialog || dialog.open) return
    // The top layer makes the page underneath inert while the outage lasts.
    if (typeof dialog.showModal === "function") dialog.showModal()
    else dialog.setAttribute("open", "")
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
  return <dialog ref={ref} className="service-gate" role="alertdialog" aria-modal="true" aria-labelledby={titleId}
    onCancel={(event) => event.preventDefault()}>
    <div className="service-gate__body">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="service-gate__logo" src={CREST_SRC} alt="" width={48} height={48} />
      <h2 className="service-gate__title" id={titleId}>{t("serviceGate.title")}</h2>
      <p className="service-gate__desc">{t("serviceGate.body")}</p>
      <p className="service-gate__hint" aria-live="polite">{checking ? t("serviceGate.checking") : t("serviceGate.nextTry", { seconds })}</p>
    </div>
    <footer className="service-gate__foot">
      <Button type="button" variant="outline" busy={checking} onClick={() => { void check() }}>{t("serviceGate.retryNow")}</Button>
    </footer>
  </dialog>
}

/**
 * App-wide outage modal, the same as the event site's. API calls report network
 * failures and 5xx into the status store; one probe confirms before the modal
 * shows. The page stays rendered and inert underneath; the modal cannot be
 * dismissed, retries on a 3/5/10/20/30 s backoff or on «Спробувати зараз», and
 * closes by itself once the API answers.
 */
export function ServiceStatusGate() {
  const status = useSyncExternalStore(subscribeServiceStatus, getServiceStatus, () => "up" as const)

  useEffect(() => {
    if (status !== "suspect") return
    const id = window.setTimeout(async () => {
      if (await probeService(apiOrigin)) reportServiceAvailable()
      else confirmServiceUnavailable()
    }, CONFIRM_MS)
    return () => window.clearTimeout(id)
  }, [status])

  const onCheck = useCallback(async () => {
    if (!await probeService(apiOrigin)) return
    reportServiceAvailable()
    // Revalidate /me and refetch the page data that failed on the current URL.
    window.location.reload()
  }, [])

  if (status !== "down") return null
  return <OutageDialog onCheck={onCheck} />
}
