"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { CONSENT_CHANGE_EVENT, CONSENT_OPEN_EVENT, readConsent, saveConsent, shouldShowBanner, type ConsentChoice } from "@/lib/consent"

function subscribe(onChange: () => void) {
  window.addEventListener(CONSENT_CHANGE_EVENT, onChange)
  return () => window.removeEventListener(CONSENT_CHANGE_EVENT, onChange)
}
// "none" = no choice yet; "ssr" = server render, where the cookie is unknown (render nothing).
const snapshot = () => readConsent() ?? "none"
const serverSnapshot = () => "ssr"

// Analytics consent banner: non-blocking, bottom of the page, two equal buttons.
// Shown when GA is configured and no choice exists, or when «Налаштування cookie»
// reopens it. Esc closes a reopened banner without changing the choice; it never
// counts as consent.
export function ConsentBanner({ gaId, policyHref }: { gaId: string; policyHref: string }) {
  const stored = useSyncExternalStore(subscribe, snapshot, serverSnapshot)
  const [reopened, setReopened] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const returnToRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const onOpen = () => {
      returnToRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setReopened(true)
    }
    window.addEventListener(CONSENT_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, onOpen)
  }, [])

  // Opened on request: move focus into the banner. Shown on load: leave focus where it is.
  useEffect(() => {
    if (reopened) panelRef.current?.focus()
  }, [reopened])

  const close = () => {
    setReopened(false)
    returnToRef.current?.focus()
    returnToRef.current = null
  }
  const choose = (choice: ConsentChoice) => {
    saveConsent(choice)
    close()
  }

  const visible = stored !== "ssr" && (reopened || shouldShowBanner(gaId, stored === "none" ? null : (stored as ConsentChoice)))
  if (!visible) return null

  const [before, after = ""] = t("consent.text").split("{link}")
  return (
    <div
      ref={panelRef}
      role="region"
      aria-labelledby="cb-consent-title"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape" && reopened && stored !== "none") close()
      }}
      className="fixed inset-x-2 bottom-2 z-[60] mx-auto flex max-w-[880px] flex-col items-stretch gap-3 rounded-md border border-border bg-card px-5 py-4 text-sm text-muted-foreground focus-visible:outline-2 focus-visible:outline-[var(--ib-action)] sm:inset-x-4 sm:bottom-4 sm:flex-row sm:items-center sm:gap-6"
    >
      <div className="min-w-0 flex-1 leading-relaxed">
        <p id="cb-consent-title" className="font-semibold text-foreground">{t("consent.title")}</p>
        <p>
          {before}
          <a href={policyHref} className="text-foreground underline underline-offset-[3px]">{t("consent.policyLink")}</a>
          {after}
        </p>
      </div>
      <div className="flex flex-none gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
        <Button type="button" variant="outline" size="sm" onClick={() => choose("denied")}>{t("consent.reject")}</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => choose("granted")}>{t("consent.accept")}</Button>
      </div>
    </div>
  )
}
