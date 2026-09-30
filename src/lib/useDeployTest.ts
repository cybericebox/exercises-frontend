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

import { deployVariant, deployStatus, destroyDeploy, openDeployLink, type DeployFlag, type DeployStatus } from "@/api/exercises/deploy"

const POLL_MS = 4000

/** Opening a web device: the link is fetched on every click, nothing is kept. */
export type DeployLinkState = "idle" | "opening" | "error"

/** The browser refused the new tab (pop-ups blocked). */
export class PopupBlockedError extends Error {}

export type DeployTestState = {
  deployId: string | null
  status: DeployStatus | null
  error: string | null
  /** The raw failure behind `error`, for mapping its backend code to a message. */
  errorCause: unknown
  /** Test flags injected into the linked devices, known from the start of the deploy. */
  flags: DeployFlag[]
  /** true while starting or polling a not-yet-terminal deploy. */
  busy: boolean
  link: DeployLinkState
  /** "device:port" of the row being opened. */
  linkKey: string | null
  linkError: unknown
}

const IDLE: DeployTestState = { deployId: null, status: null, error: null, errorCause: null, flags: [], busy: false, link: "idle", linkKey: null, linkError: null }

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

  const lastLink = useRef<{ device: string; port: number } | null>(null)

  // The tab is opened synchronously inside the click, before the request, so the
  // browser treats it as user-initiated; its location is set once the link arrives.
  const openLink = useCallback((device: string, port: number) => {
    const id = activeId.current
    if (!id) return
    lastLink.current = { device, port }
    const tab = window.open("about:blank", "_blank")
    if (!tab) {
      setState((p) => ({ ...p, link: "error", linkKey: null, linkError: new PopupBlockedError() }))
      return
    }
    tab.opener = null
    setState((p) => ({ ...p, link: "opening", linkKey: `${device}:${port}`, linkError: null }))
    openDeployLink(id, device, port).then(
      (l) => {
        tab.location.href = l.URL
        if (activeId.current === id) setState((p) => ({ ...p, link: "idle", linkKey: null }))
      },
      (e) => {
        tab.close()
        if (activeId.current === id) setState((p) => ({ ...p, link: "error", linkKey: null, linkError: e }))
      }
    )
  }, [])

  const retryLink = useCallback(() => {
    if (lastLink.current) openLink(lastLink.current.device, lastLink.current.port)
  }, [openLink])

  const poll = useCallback(async (id: string) => {
    let s: DeployStatus
    try {
      s = await deployStatus(id)
    } catch (e) {
      if (activeId.current !== id) return
      setState((p) => ({ ...p, error: (e as Error).message, errorCause: e, busy: false }))
      return
    }
    if (activeId.current !== id) return // a newer deploy (or a close) superseded this one
    const terminal = s.Ready || s.Phase === "Failed"
    setState((p) => ({ ...p, status: s, busy: !terminal }))
    if (!terminal) {
      timer.current = setTimeout(() => void poll(id), POLL_MS)
    }
  }, [])

  const start = useCallback(
    async (exerciseId: string, versionId: string, variantId: string) => {
      const sequence = ++requestSequence.current
      clearTimer()
      const previousId = activeId.current
      activeId.current = null
      if (previousId) void Promise.resolve(destroyDeploy(previousId)).catch(() => {})
      setState({ ...IDLE, busy: true })
      let deployID: string
      let flags: DeployFlag[]
      try {
        ;({ DeployID: deployID, Flags: flags = [] } = await deployVariant(exerciseId, versionId, variantId))
      } catch (e) {
        if (sequence === requestSequence.current) setState({ ...IDLE, error: (e as Error).message, errorCause: e })
        return
      }
      if (sequence !== requestSequence.current) {
        void Promise.resolve(destroyDeploy(deployID)).catch(() => {})
        return
      }
      activeId.current = deployID
      setState((p) => ({ ...p, deployId: deployID, flags }))
      void poll(deployID)
    },
    [poll]
  )

  /** Reopen a deploy that is already running: poll it instead of creating a new one. */
  const attach = useCallback(
    (deployID: string, flags: DeployFlag[]) => {
      ++requestSequence.current
      clearTimer()
      activeId.current = deployID
      setState({ ...IDLE, busy: true, deployId: deployID, flags })
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

  return { ...state, start, attach, close, openLink, retryLink }
}
