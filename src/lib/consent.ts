/**
 * src/lib/consent.ts — analytics consent shared by all CyberICEBox frontends.
 *
 * COPY-TO-RP-APPS: app-agnostic, static-export-safe, no React.
 *
 * Google Consent Mode v2. Every signal defaults to `denied` before gtag loads;
 * «Прийняти аналітику» updates only `analytics_storage` to `granted`, the ad
 * signals stay denied forever (the platform runs no ads). Without consent GA
 * runs cookieless (consent pings only).
 *
 * The choice lives in the `cib_consent` cookie on the parent domain
 * (.NEXT_PUBLIC_DOMAIN, 12 months), so a choice made on any app applies to all.
 */

export type ConsentChoice = "granted" | "denied"
type ConsentState = Record<"analytics_storage" | "ad_storage" | "ad_user_data" | "ad_personalization", ConsentChoice>

export const CONSENT_COOKIE = "cib_consent"
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 365
// «Налаштування cookie» fires OPEN to reopen the banner; saveConsent fires CHANGE.
export const CONSENT_OPEN_EVENT = "cib:consent-open"
export const CONSENT_CHANGE_EVENT = "cib:consent-change"

export const CONSENT_DEFAULTS: ConsentState = {
  analytics_storage: "denied",
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
}

const PATTERN = `(?:^|; )${CONSENT_COOKIE}=(granted|denied)`

/** The stored choice in a `document.cookie` string, or null when none was made. */
export function parseConsent(cookie: string): ConsentChoice | null {
  return (new RegExp(PATTERN).exec(cookie)?.[1] as ConsentChoice | undefined) ?? null
}

/** The Consent Mode update for a choice: only analytics_storage ever changes. */
export function consentUpdate(choice: ConsentChoice): Pick<ConsentState, "analytics_storage"> {
  return { analytics_storage: choice }
}

/** The Set-Cookie string for a choice; host-only when no parent domain is configured (dev). */
export function consentCookie(choice: ConsentChoice, opts: { domain?: string; secure: boolean }): string {
  const parts = [`${CONSENT_COOKIE}=${choice}`, "path=/", `max-age=${CONSENT_MAX_AGE}`, "SameSite=Lax"]
  if (opts.domain) parts.push(`domain=.${opts.domain}`)
  if (opts.secure) parts.push("Secure")
  return parts.join("; ")
}

/** The banner asks only when GA is configured and no choice exists yet. */
export function shouldShowBanner(gaId: string | undefined, choice: ConsentChoice | null): boolean {
  return Boolean(gaId) && choice === null
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
    `if(new RegExp(${JSON.stringify(PATTERN)}).exec(document.cookie)?.[1]==="granted")gtag("consent","update",${JSON.stringify(consentUpdate("granted"))});`,
    `gtag("js",new Date());gtag("config",${JSON.stringify(gaId)});`,
  ].join("")
}

type GtagWindow = Window & { gtag?: (...args: unknown[]) => void }

export function readConsent(): ConsentChoice | null {
  return typeof document === "undefined" ? null : parseConsent(document.cookie)
}

// GA's own cookies (_ga, _ga_<id>) on the host and the parent domain — dropped when consent is withdrawn.
function clearAnalyticsCookies(domain: string | undefined): void {
  for (const name of document.cookie.split("; ").map((c) => c.split("=")[0])) {
    if (name !== "_ga" && !name.startsWith("_ga_")) continue
    document.cookie = `${name}=; path=/; max-age=0`
    if (domain) document.cookie = `${name}=; path=/; max-age=0; domain=.${domain}`
  }
}

/** Persist the choice on the parent domain and apply it to a running gtag. */
export function saveConsent(choice: ConsentChoice): void {
  const domain = process.env.NEXT_PUBLIC_DOMAIN || undefined
  document.cookie = consentCookie(choice, { domain, secure: location.protocol === "https:" })
  ;(window as GtagWindow).gtag?.("consent", "update", consentUpdate(choice))
  if (choice === "denied") clearAnalyticsCookies(domain)
  window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT))
}

/** «Налаштування cookie»: reopen the banner. */
export function openConsentSettings(): void {
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT))
}
