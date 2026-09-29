"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { adminOrigin, apiOrigin, idOrigin, publicDomain } from "@/lib/origins"
import { backHosts, resolveBack, type BackLink } from "@/lib/backLink"

const exercisesDomain = process.env.NEXT_PUBLIC_EXERCISES_DOMAIN?.trim() || (publicDomain && `exercises.${publicDomain}`)
const HOSTS = backHosts(publicDomain, {
  admin: adminOrigin,
  exercises: exercisesDomain ? `https://${exercisesDomain}` : "",
  id: idOrigin,
  api: apiOrigin,
})

function tabStorage(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/**
 * Where the top bar's back arrow leads (lib/backLink), re-resolved on every in-app navigation.
 * Event pages opened the catalog with ?return=; newer callers send ?return_to=.
 */
export function useBackLink(): BackLink | null {
  const pathname = usePathname()
  const [link, setLink] = useState<BackLink | null>(null)
  useEffect(() => {
    const search = new URLSearchParams(window.location.search)
    const next = resolveBack({
      returnTo: search.get("return_to") ?? search.get("return"),
      referrer: document.referrer,
      currentHost: window.location.hostname,
    }, HOSTS, tabStorage())
    queueMicrotask(() => setLink(next))
  }, [pathname])
  return link
}
