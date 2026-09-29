"use client"

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { t } from "@/i18n/t"
import {
  ACCEPT_ALL,
  CONSENT_CHANGE_EVENT,
  CONSENT_OPEN_EVENT,
  POLICY_LINK_ATTRS,
  readConsent,
  saveConsent,
  shouldShowBanner,
  type ConsentPrefs,
} from "@/lib/consent"

function subscribe(onChange: () => void) {
  window.addEventListener(CONSENT_CHANGE_EVENT, onChange)
  return () => window.removeEventListener(CONSENT_CHANGE_EVENT, onChange)
}
// A primitive snapshot: "none" = no choice yet; "ssr" = server render, cookie unknown (render nothing).
const snapshot = () => {
  const prefs = readConsent()
  return prefs ? (prefs.analytics ? "granted" : "denied") : "none"
}
const serverSnapshot = () => "ssr"

// A message with a {link} placeholder, the link inserted in place (t() has no rich variant).
function withLink(key: string, link: ReactNode) {
  const [before, after = ""] = t(key).split("{link}")
  return (
    <>
      {before}
      {link}
      {after}
    </>
  )
}

const BOX =
  "fixed inset-x-2 bottom-2 z-[60] mx-auto rounded-md border border-border bg-card text-sm leading-relaxed text-muted-foreground focus-visible:outline-2 focus-visible:outline-[var(--ib-action)] sm:inset-x-4 sm:bottom-4"

// Cookie consent in two layers, fixed to the bottom, non-blocking.
// 1. Banner: a general line, «Налаштувати» and «Прийняти всі».
// 2. Panel: categories (Необхідні — always on; Аналітика — off by default),
//    «Зберегти вибір» and «Прийняти всі».
// Shown when GA is configured and no choice exists; «Налаштування файлів cookie» opens the panel.
// Esc never counts as consent: it steps back from the panel, or closes a panel opened from settings.
export function ConsentBanner({ gaId, policyHref }: { gaId?: string; policyHref: string }) {
  const stored = useSyncExternalStore(subscribe, snapshot, serverSnapshot)
  // null = follow the stored choice; "panel" = preferences open.
  const [layer, setLayer] = useState<"banner" | "panel" | null>(null)
  const [analytics, setAnalytics] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const returnToRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const onOpen = () => {
      returnToRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setAnalytics(readConsent()?.analytics ?? false)
      setLayer("panel")
    }
    window.addEventListener(CONSENT_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, onOpen)
  }, [])

  // The panel was opened on request: move focus into it. Shown on load: leave focus where it is.
  useEffect(() => {
    if (layer === "panel") rootRef.current?.focus()
  }, [layer])

  const close = () => {
    setLayer(null)
    returnToRef.current?.focus()
    returnToRef.current = null
  }
  const choose = (prefs: ConsentPrefs) => {
    saveConsent(prefs)
    close()
  }

  if (stored === "ssr") return null
  const asking = shouldShowBanner(gaId, stored === "none" ? null : { analytics: stored === "granted" })
  const shown = layer ?? (asking ? "banner" : null)
  if (!shown) return null

  const policyLink = (
    // New tab; the click must not reach any outer handler, so the banner/panel and its toggles stay.
    <a
      href={policyHref}
      {...POLICY_LINK_ATTRS}
      aria-label={t("consent.policyLinkNewTab")}
      onClick={(e) => e.stopPropagation()}
      className="text-foreground underline underline-offset-[3px]"
    >
      {t("consent.policyLink")}
    </a>
  )

  if (shown === "banner") {
    return (
      <div
        ref={rootRef}
        role="region"
        aria-label={t("consent.label")}
        tabIndex={-1}
        className={`${BOX} flex max-w-[880px] flex-col items-stretch gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-6`}
      >
        <p className="min-w-0 flex-1">{withLink("consent.text", policyLink)}</p>
        <div className="flex flex-none gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
          <Button type="button" variant="outline" size="sm" onClick={() => setLayer("panel")}>
            {t("consent.customize")}
          </Button>
          <Button type="button" size="sm" onClick={() => choose(ACCEPT_ALL)}>
            {t("consent.acceptAll")}
          </Button>
        </div>
      </div>
    )
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return
    if (asking) setLayer("banner")
    else close()
  }
  const categories = [
    { key: "necessary", checked: true, disabled: true, onChange: () => {} },
    { key: "analytics", checked: analytics, disabled: false, onChange: setAnalytics },
  ]

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby="cb-consent-title"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className={`${BOX} max-h-[calc(100dvh-2rem)] max-w-[340px] overflow-y-auto p-5`}
    >
      <p id="cb-consent-title" className="text-base font-semibold text-foreground">
        {t("consent.panelTitle")}
      </p>
      <ul className="mt-3">
        {categories.map((c) => (
          <li key={c.key} className="flex items-center justify-between gap-4 border-t border-border py-3">
            <span>
              <span className="block font-medium text-foreground">{t(`consent.${c.key}.title`)}</span>
              <span className="block text-xs">{t(`consent.${c.key}.text`)}</span>
            </span>
            <Switch checked={c.checked} disabled={c.disabled} onCheckedChange={c.onChange} aria-label={t(c.key === "necessary" ? "consent.necessary.switch" : `consent.${c.key}.title`)} />
          </li>
        ))}
      </ul>
      <p className="border-t border-border pt-3 text-xs">{withLink("consent.policy", policyLink)}</p>
      <div className="mt-4 flex items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => choose({ analytics })}>
          {t("consent.saveChoice")}
        </Button>
        <Button type="button" size="sm" className="flex-1 sm:flex-none" onClick={() => choose(ACCEPT_ALL)}>
          {t("consent.acceptAll")}
        </Button>
      </div>
    </div>
  )
}
