// Every browser-facing host comes from its own required NEXT_PUBLIC_*_HOST env (bare host,
// no scheme); next.config.ts fails the build and the container entrypoint fails the start
// when one is missing. There are no derivations and no fallbacks.
export const publicDomain = process.env.NEXT_PUBLIC_MAIN_HOST ?? ""
export const eventDomain = process.env.NEXT_PUBLIC_EVENT_DOMAIN ?? ""
export const exercisesHost = process.env.NEXT_PUBLIC_EXERCISES_HOST ?? ""

const origin = (host: string | undefined) => `https://${host ?? ""}`

export const apiOrigin = origin(process.env.NEXT_PUBLIC_API_HOST)
export const idOrigin = origin(process.env.NEXT_PUBLIC_ID_HOST)
export const adminOrigin = origin(process.env.NEXT_PUBLIC_ADMIN_HOST)
export const mainOrigin = origin(process.env.NEXT_PUBLIC_MAIN_HOST)
export const exercisesOrigin = origin(process.env.NEXT_PUBLIC_EXERCISES_HOST)

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
