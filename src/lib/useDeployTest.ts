/**
 * useDeployTest — drives the per-variant test-deploy lifecycle: start a deploy,
 * poll its status until it is Ready or Failed, and tear it down on close/unmount.
 *
 * The deploy is stateless on the server (the lab group IS the state), so this hook
 * owns nothing but the active deploy id and a polling timer. Stale responses (from
 * a deploy that was closed or restarted) are dropped by comparing against the live
 * id, so a slow in-flight poll can never overwrite a newer deploy's state.
 */
import { useCallback, useEffect, useRef, useState } from "react"

import { deployVariant, deployStatus, destroyDeploy, openDeploySession, type DeployStatus } from "@/api/exercises/deploy"

const POLL_MS = 4000

/** The proxy cookie for the web devices: needed only when the lab exposes any. */
export type DeploySessionState = "none" | "opening" | "open" | "error"

export type DeployTestState = {
  deployId: string | null
  status: DeployStatus | null
  error: string | null
  /** true while starting or polling a not-yet-terminal deploy. */
  busy: boolean
  session: DeploySessionState
  sessionError: unknown
}

const IDLE: DeployTestState = { deployId: null, status: null, error: null, busy: false, session: "none", sessionError: null }

export function useDeployTest() {
  const [state, setState] = useState<DeployTestState>(IDLE)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeId = useRef<string | null>(null)
  const requestSequence = useRef(0)

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  const openSession = useCallback(async (id: string) => {
    setState((p) => ({ ...p, session: "opening", sessionError: null }))
    try {
      await openDeploySession(id)
    } catch (e) {
      if (activeId.current === id) setState((p) => ({ ...p, session: "error", sessionError: e }))
      return
    }
    if (activeId.current === id) setState((p) => ({ ...p, session: "open" }))
  }, [])

  const retrySession = useCallback(() => {
    if (activeId.current) void openSession(activeId.current)
  }, [openSession])

  const poll = useCallback(async (id: string) => {
    let s: DeployStatus
    try {
      s = await deployStatus(id)
    } catch (e) {
      if (activeId.current !== id) return
      setState((p) => ({ ...p, error: (e as Error).message, busy: false }))
      return
    }
    if (activeId.current !== id) return // a newer deploy (or a close) superseded this one
    const terminal = s.Ready || s.Phase === "Failed"
    setState((p) => ({ ...p, status: s, busy: !terminal }))
    if (!terminal) {
      timer.current = setTimeout(() => void poll(id), POLL_MS)
    } else if (s.Ready && (s.Access?.length ?? 0) > 0) {
      // Asked once, when the lab is ready and only if it has web devices; the cookie
      // lasts until the deploy's lease ends, so there is no refresh loop.
      void openSession(id)
    }
  }, [openSession])

  const start = useCallback(
    async (exerciseId: string, versionId: string, variantId: string) => {
      const sequence = ++requestSequence.current
      clearTimer()
      const previousId = activeId.current
      activeId.current = null
      if (previousId) void Promise.resolve(destroyDeploy(previousId)).catch(() => {})
      setState({ ...IDLE, busy: true })
      let deployID: string
      try {
        ;({ DeployID: deployID } = await deployVariant(exerciseId, versionId, variantId))
      } catch (e) {
        if (sequence === requestSequence.current) setState({ ...IDLE, error: (e as Error).message })
        return
      }
      if (sequence !== requestSequence.current) {
        void Promise.resolve(destroyDeploy(deployID)).catch(() => {})
        return
      }
      activeId.current = deployID
      setState((p) => ({ ...p, deployId: deployID }))
      void poll(deployID)
    },
    [poll]
  )

  const close = useCallback(() => {
    ++requestSequence.current
    clearTimer()
    const id = activeId.current
    activeId.current = null
    if (id) void Promise.resolve(destroyDeploy(id)).catch(() => {})
    setState(IDLE)
  }, [])

  // Tear the deploy down if the component unmounts mid-flight.
  useEffect(
    () => () => {
      ++requestSequence.current
      clearTimer()
      const id = activeId.current
      activeId.current = null
      if (id) void Promise.resolve(destroyDeploy(id)).catch(() => {})
    },
    []
  )

  return { ...state, start, close, retrySession }
}
