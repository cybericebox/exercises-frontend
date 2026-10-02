"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { getElevation, type Elevation } from "@/api/exercises/elevation"
import { frameIssues, publishBlocked, taskTotals, variantsDiffer, type FrameIssue, type TaskTotals } from "@/lib/deviceResources"
import type { DraftFormValues } from "@/lib/exerciseSchemas"

export type ResourceGate = {
  elevation: Elevation | null
  loading: boolean
  error: unknown
  reload: () => void
  setElevation: (elevation: Elevation) => void
  totals: TaskTotals
  differ: boolean
  issues: FrameIssue[]
  /** Something is above the frame without an approval: publishing waits. */
  blocked: boolean
}

/**
 * The resources of the working copy against the elevation approval: totals, outside-the-frame
 * devices and whether publishing is blocked. The elevation is loaded once per exercise and
 * replaced by the answer of a request; editing values never refetches it.
 */
export function useResourceGate(exerciseId: string | null, variants: DraftFormValues["Variants"]): ResourceGate {
  const [attempt, setAttempt] = useState(0)
  const key = `${exerciseId}:${attempt}`
  const [state, setState] = useState<{ id: string | null; key: string; elevation: Elevation | null; error: unknown }>({ id: null, key: "", elevation: null, error: null })

  useEffect(() => {
    if (!exerciseId) return
    let cancelled = false
    getElevation(exerciseId)
      .then((elevation) => { if (!cancelled) setState({ id: exerciseId, key, elevation, error: null }) })
      .catch((error) => { if (!cancelled) setState((previous) => ({ id: exerciseId, key, elevation: previous.id === exerciseId ? previous.elevation : null, error })) })
    return () => { cancelled = true }
  }, [exerciseId, key])

  const settled = exerciseId === null || state.key === key
  const elevation = exerciseId !== null && state.id === exerciseId ? state.elevation : null
  const approved = elevation?.Approved
  const issues = useMemo(() => frameIssues(variants, approved ?? []), [variants, approved])
  const totals = useMemo(() => taskTotals(variants), [variants])
  const reload = useCallback(() => setAttempt((value) => value + 1), [])
  const setElevation = useCallback((next: Elevation) => setState({ id: exerciseId, key, elevation: next, error: null }), [exerciseId, key])

  return {
    elevation,
    loading: !settled,
    error: settled ? state.error : null,
    reload, setElevation, totals,
    differ: variantsDiffer(totals),
    issues,
    blocked: publishBlocked(issues),
  }
}
