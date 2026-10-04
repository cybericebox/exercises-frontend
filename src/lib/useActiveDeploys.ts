/**
 * useActiveDeploys — the caller's active test deploys of one exercise, kept in
 * step across tabs: fetched on mount and on window focus, and polled while one
 * exists. A refetch never clears the list (no loader, no flash): the previous
 * items stay until the answer arrives, and a failed refetch keeps them too.
 */
import { useCallback, useEffect, useRef, useState } from "react"

import { listDeploys, type DeployListItem } from "@/api/exercises/deploy"

export const ACTIVE_DEPLOYS_POLL_MS = 15000

/** `all` lists the user's running tests of every exercise (the navbar), otherwise those of `exerciseId`. */
export function useActiveDeploys(exerciseKey: string | null, all = false) {
  const exerciseId = all ? "*" : exerciseKey
  const [state, setState] = useState<{ exerciseId: string | null; items: DeployListItem[] }>({ exerciseId: null, items: [] })
  const items = state.exerciseId === exerciseId ? state.items : []
  const forgotten = useRef(new Set<string>())
  const sequence = useRef(0)

  const refresh = useCallback(async () => {
    if (!exerciseId) return
    const mine = ++sequence.current
    try {
      const next = await listDeploys(all ? undefined : exerciseId)
      if (mine !== sequence.current) return
      forgotten.current = new Set([...forgotten.current].filter((id) => next.some((item) => item.DeployID === id)))
      setState({ exerciseId, items: next.filter((item) => !forgotten.current.has(item.DeployID)) })
    } catch {
      // Keep what is shown; the next tick or focus tries again.
    }
  }, [exerciseId, all])

  useEffect(() => {
    void refresh()
    const onFocus = () => void refresh()
    const onVisible = () => { if (document.visibilityState === "visible") void refresh() }
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [refresh])

  const active = items.length > 0
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => void refresh(), ACTIVE_DEPLOYS_POLL_MS)
    return () => clearInterval(timer)
  }, [active, refresh])

  /** Hide a deploy that is being torn down until the server stops listing it. */
  const forget = useCallback((id: string) => {
    forgotten.current.add(id)
    setState((current) => ({ ...current, items: current.items.filter((item) => item.DeployID !== id) }))
  }, [])

  return { items, refresh, forget }
}
