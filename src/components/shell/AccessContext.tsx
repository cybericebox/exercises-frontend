"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { getExerciseAccess, type ExerciseAccess } from "@/api/exercises/access"
import { onServiceRestored } from "@/lib/serviceStatus"

/** error: the rights could not be read (5xx, network); retry reads them again. */
export type AccessState = { access: ExerciseAccess | null; loading: boolean; error?: unknown; retry?: () => void }

// Default (no provider, e.g. isolated page tests): rights unknown → RBAC fallback.
const Context = createContext<AccessState>({ access: null, loading: false })

/**
 * Loads GET /exercises/access once per session (again after an outage). A failure is an error with a retry, never
 * a guess: without its rights an event manager would see «Немає доступу» while the service only did not answer.
 */
export function AccessProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AccessState>({ access: null, loading: true })
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => {
    setState({ access: null, loading: true })
    setAttempt((value) => value + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = () => {
      getExerciseAccess()
        .then((access) => { if (!cancelled) setState({ access, loading: false }) })
        .catch((error: unknown) => { if (!cancelled) setState({ access: null, loading: false, error }) })
    }
    load()
    const unsubscribe = onServiceRestored(load)
    return () => { cancelled = true; unsubscribe() }
  }, [attempt])

  return <Context.Provider value={{ ...state, retry }}>{children}</Context.Provider>
}

export function useExerciseAccess(): AccessState {
  return useContext(Context)
}
