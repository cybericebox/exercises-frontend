/**
 * src/lib/consent.ts — cookie consent shared by all CyberICEBox frontends.
 *
 * COPY-TO-RP-APPS: app-agnostic, static-export-safe, no React.
 *
 * Categories: «Необхідні» (always on, no consent needed) and «Аналітика»
 * (Google Analytics, off until the user turns it on). Google Consent Mode v2:
 * every signal defaults to `denied` before gtag loads; analytics consent maps
 * to `analytics_storage` only, the ad signals stay denied forever (the
 * platform runs no ads). Without consent GA runs cookieless (consent pings).
 *
 * The choice lives in the `cib_consent` cookie on the parent domain
 * (.NEXT_PUBLIC_DOMAIN, 12 months) as `analytics:granted|denied`, so a choice
 * made on any app applies to all.
 */

export type ConsentPrefs = { analytics: boolean }
type Signal = "granted" | "denied"
type ConsentState = Record<"analytics_storage" | "ad_storage" | "ad_user_data" | "ad_personalization", Signal>

export const CONSENT_COOKIE = "cib_consent"
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 365
// «Налаштування файлів cookie» fires OPEN to open the preferences panel; saveConsent fires CHANGE.
export const CONSENT_OPEN_EVENT = "cib:consent-open"
export const CONSENT_CHANGE_EVENT = "cib:consent-change"

export const ACCEPT_ALL: ConsentPrefs = { analytics: true }
export const REJECT_ALL: ConsentPrefs = { analytics: false }

export const CONSENT_DEFAULTS: ConsentState = {
  analytics_storage: "denied",
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
}

const COOKIE_VALUE = `(?:^|; )${CONSENT_COOKIE}=([^;]*)`
// The boot script only needs to know whether analytics was granted.
const ANALYTICS_GRANTED = `(?:^|; )${CONSENT_COOKIE}=[^;]*\\banalytics:granted\\b`

/** The stored choice in a `document.cookie` string, or null when none was made. */
export function parseConsent(cookie: string): ConsentPrefs | null {
  const value = new RegExp(COOKIE_VALUE).exec(cookie)?.[1]
  const analytics = value ? /\banalytics:(granted|denied)\b/.exec(value)?.[1] : undefined
  return analytics ? { analytics: analytics === "granted" } : null
}

/** The Consent Mode update for a choice: only analytics_storage ever changes. */
export function consentUpdate(prefs: ConsentPrefs): Pick<ConsentState, "analytics_storage"> {
  return { analytics_storage: prefs.analytics ? "granted" : "denied" }
}

/** The Set-Cookie string for a choice; host-only when no parent domain is configured (dev). */
export function consentCookie(prefs: ConsentPrefs, opts: { domain?: string; secure: boolean }): string {
  const parts = [
    `${CONSENT_COOKIE}=analytics:${prefs.analytics ? "granted" : "denied"}`,
    "path=/",
    `max-age=${CONSENT_MAX_AGE}`,
    "SameSite=Lax",
  ]
  if (opts.domain) parts.push(`domain=.${opts.domain}`)
  if (opts.secure) parts.push("Secure")
  return parts.join("; ")
}

/** The banner asks only when GA is configured (the only optional category) and no choice exists yet. */
export function shouldShowBanner(gaId: string | undefined, prefs: ConsentPrefs | null): boolean {
  return Boolean(gaId) && prefs === null
}

/**
 * Inline gtag bootstrap, run before gtag.js: denied defaults, then the stored
 * choice, then config. gaId goes in through JSON.stringify (no script injection).
 */
export function gtagBootScript(gaId: string): string {
  return [
    "window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;",
    `gtag("consent","default",${JSON.stringify(CONSENT_DEFAULTS)});`,
    `gtag("set","ads_data_redaction",true);`,
    `if(new RegExp(${JSON.stringify(ANALYTICS_GRANTED)}).test(document.cookie))gtag("consent","update",${JSON.stringify(consentUpdate(ACCEPT_ALL))});`,
    `gtag("js",new Date());gtag("config",${JSON.stringify(gaId)});`,
  ].join("")
}

type GtagWindow = Window & { gtag?: (...args: unknown[]) => void }

export function readConsent(): ConsentPrefs | null {
  return typeof document === "undefined" ? null : parseConsent(document.cookie)
}

// GA's own cookies (_ga, _ga_<id>) on the host and the parent domain — dropped when analytics is off.
function clearAnalyticsCookies(domain: string | undefined): void {
  for (const name of document.cookie.split("; ").map((c) => c.split("=")[0])) {
    if (name !== "_ga" && !name.startsWith("_ga_")) continue
    document.cookie = `${name}=; path=/; max-age=0`
    if (domain) document.cookie = `${name}=; path=/; max-age=0; domain=.${domain}`
  }
}

/** Persist the choice on the parent domain and apply it to a running gtag. */
export function saveConsent(prefs: ConsentPrefs): void {
  const domain = process.env.NEXT_PUBLIC_DOMAIN || undefined
  document.cookie = consentCookie(prefs, { domain, secure: location.protocol === "https:" })
  ;(window as GtagWindow).gtag?.("consent", "update", consentUpdate(prefs))
  if (!prefs.analytics) clearAnalyticsCookies(domain)
  window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT))
}

/**
 * The cookie-policy link inside the banner and panel opens in a new tab, so the
 * panel and its unsaved toggles stay put. Spread onto the <a> with an aria-label
 * that says so («відкриється в новій вкладці»).
 */
export const POLICY_LINK_ATTRS = { target: "_blank", rel: "noopener noreferrer" } as const

/** «Налаштування файлів cookie»: open the preferences panel. */
export function openConsentSettings(): void {
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT))
}
