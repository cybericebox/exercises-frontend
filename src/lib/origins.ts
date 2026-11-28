// Every browser-facing host derives from the one base domain NEXT_PUBLIC_DOMAIN (src/lib/hosts.ts); a missing domain fails the build
// (next.config.ts) and the container start (entrypoint).
import { hosts } from "@/lib/hosts"

const h = hosts()
export const mainHost = h.main
export const eventDomain = h.eventDomain
export const exercisesHost = h.exercises

const origin = (host: string) => `https://${host}`

export const apiOrigin = origin(h.api)
export const idOrigin = origin(h.id)
export const adminOrigin = origin(h.admin)
export const mainOrigin = origin(h.main)
export const exercisesOrigin = origin(h.exercises)

/**
 * signInURL — the ID app's sign-in page with a return_to back here.
 * A return_to that already points at a sign-in page is replaced by this app's root.
 */
export function signInURL(returnTo: string, advertised?: string): string {
  const base = advertised || `${idOrigin}/sign-in`
  let back = returnTo
  try {
    if (new URL(returnTo).pathname.startsWith("/sign-in")) back = new URL("/", returnTo).toString()
  } catch { /* keep as is */ }
  const url = new URL(base)
  url.searchParams.set("return_to", back)
  return url.toString()
}

/** Backend SECOND_FACTOR_ENROLMENT_REQUIRED: a super admin without a second factor is held at enrolment. */
export const SECOND_FACTOR_ENROLMENT_REQUIRED = 63812

/**
 * secondFactorURL — the ID app's second-factor page with a return_to back here.
 * Returns "" when the address already is on the ID site, so two redirects never bounce.
 */
export function secondFactorURL(returnTo: string, id: string = idOrigin): string {
  if (!id || returnTo === id || returnTo.startsWith(`${id}/`) || returnTo.startsWith(`${id}?`)) return ""
  return `${id}/second-factor/?return_to=${encodeURIComponent(returnTo)}`
}
