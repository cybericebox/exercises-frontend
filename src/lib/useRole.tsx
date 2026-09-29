"use client"

import React, { createContext, useCallback, useContext, useEffect, useState } from "react"
import { fetchMe, type Me } from "@/lib/auth"
import { isServiceDown, onServiceRestored } from "@/lib/serviceStatus"

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
  permissions: string[]
  can: (required: string) => boolean
}

const RoleContext = createContext<RoleState>({
  me: null,
  role: null,
  isLoading: true,
  permissions: [],
  can: () => false,
})

const noPermissions: string[] = []

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      void fetchMe()
        .then((m) => { if (!cancelled) setMe(m) })
        .catch(() => { if (!cancelled && !isServiceDown()) setMe(null) })
        .finally(() => { if (!cancelled && !isServiceDown()) setIsLoading(false) })
    }
    load()
    const unsubscribe = onServiceRestored(load)
    return () => { cancelled = true; unsubscribe() }
  }, [])

  const role = (me?.Role as Role | undefined) ?? null
  const permissions = me?.Permissions ?? noPermissions
  const can = useCallback(
    (required: string) => permissions.some((h) => covers(h, required)),
    [permissions],
  )

  return (
    <RoleContext.Provider value={{ me, role, isLoading, permissions, can }}>
      {children}
    </RoleContext.Provider>
  )
}

export function useRole(): RoleState {
  return useContext(RoleContext)
}
