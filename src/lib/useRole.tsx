"use client"

import React, { createContext, useCallback, useContext, useEffect, useState } from "react"
import { fetchMe, type Me } from "@/lib/auth"
import { isBackendUnreachable, onServiceRestored, reportServiceUnavailable } from "@/lib/serviceStatus"

export type Role = "user" | "admin_viewer" | "admin" | "super_admin"

// covers mirrors the backend rbac.covers: a held permission grants a required one
// when held is "*", exactly equal, or a dotted-prefix ancestor of required.
function covers(held: string, required: string): boolean {
  return held === "*" || held === required || required.startsWith(held + ".")
}

export interface RoleState {
  me: Me | null
  role: Role | null
  isLoading: boolean
  /** The session check failed (5xx, network): neither signed in nor anonymous. `retry` runs it again. */
  error: unknown
  retry: () => void
  permissions: string[]
  can: (required: string) => boolean
}

const RoleContext = createContext<RoleState>({
  me: null,
  role: null,
  isLoading: true,
  error: null,
  retry: () => {},
  permissions: [],
  can: () => false,
})

const noPermissions: string[] = []

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      void fetchMe()
        .then((m) => { if (!cancelled) { setMe(m); setError(null); setIsLoading(false) } })
        // A failed check must not leave the app on the loader: the shell shows the error page.
        .catch((e: unknown) => {
          if (cancelled) return
          // The backend cannot be reached: the service gate probes once after the grace period and shows its overlay, the loader stays, and the check re-runs when the gate sees the backend back.
          if (isBackendUnreachable(e)) { setError(null); setMe(null); reportServiceUnavailable(); return }
          setError(e ?? new Error("session check failed"))
          setIsLoading(false)
        })
    }
    load()
    const unsubscribe = onServiceRestored(load)
    return () => { cancelled = true; unsubscribe() }
  }, [attempt])

  const retry = useCallback(() => {
    setError(null)
    setIsLoading(true)
    setAttempt((n) => n + 1)
  }, [])

  const role = (me?.Role as Role | undefined) ?? null
  const permissions = me?.Permissions ?? noPermissions
  const can = useCallback(
    (required: string) => permissions.some((h) => covers(h, required)),
    [permissions],
  )

  return (
    <RoleContext.Provider value={{ me, role, isLoading, error, retry, permissions, can }}>
      {children}
    </RoleContext.Provider>
  )
}

export function useRole(): RoleState {
  return useContext(RoleContext)
}
