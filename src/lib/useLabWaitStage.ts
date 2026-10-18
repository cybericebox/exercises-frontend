"use client"

import { useEffect, useRef, useState } from "react"
import type { DeployStatus } from "@/api/exercises/deploy"
import { earliestQueuedAt, LONG_WAIT_MS } from "@/lib/deviceLive"

/**
 * True once a starting lab has been waiting for more than 30 s. The wait is counted from the earliest queue time in
 * the status; when the status carries none, from the moment the caller mounted (the page first saw the lab starting).
 * Mount it only while the lab is starting.
 */
export function useLongWait(status: DeployStatus | null | undefined): boolean {
  const [longWait, setLongWait] = useState(false)
  const firstSeen = useRef<number | null>(null)
  const queuedAt = earliestQueuedAt(status?.Devices)
  useEffect(() => {
    firstSeen.current ??= Date.now()
    const remaining = Math.max(0, LONG_WAIT_MS - (Date.now() - (queuedAt ?? firstSeen.current)))
    const timer = window.setTimeout(() => setLongWait(true), remaining)
    return () => window.clearTimeout(timer)
  }, [queuedAt])
  return longWait
}
