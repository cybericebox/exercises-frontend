"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { getExerciseAccess, type ExerciseAccess } from "@/api/exercises/access"
import { accessFromRbac } from "@/lib/exerciseRights"
import { useRole } from "@/lib/useRole"
import { onServiceRestored } from "@/lib/serviceStatus"

export type AccessState = { access: ExerciseAccess | null; loading: boolean }

// Default (no provider, e.g. isolated page tests): rights unknown → RBAC fallback.
const Context = createContext<AccessState>({ access: null, loading: false })

/** Loads GET /exercises/access once per session (again after an outage). */
export function AccessProvider({ children }: { children: React.ReactNode }) {
  const { can } = useRole()
  const [state, setState] = useState<AccessState>({ access: null, loading: true })

  useEffect(() => {
    let cancelled = false
    const load = () => {
      getExerciseAccess()
        .then((access) => { if (!cancelled) setState({ access, loading: false }) })
        // Older API without /access: derive the rights from RBAC.
        .catch(() => { if (!cancelled) setState({ access: accessFromRbac(can), loading: false }) })
    }
    load()
    const unsubscribe = onServiceRestored(load)
    return () => { cancelled = true; unsubscribe() }
  }, [can])

  return <Context.Provider value={state}>{children}</Context.Provider>
}

export function useExerciseAccess(): AccessState {
  return useContext(Context)
}
