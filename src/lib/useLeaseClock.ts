/**
 * useLeaseClock — one shared clock for a list of lease expiry times. Returns «now» and re-renders
 * on a single timer: every second while a lease has under 10 minutes left, otherwise every 30 s.
 * Idle while `enabled` is false or nothing is left to count. `onExpired` fires once per lease
 * when its time runs out. Remaining time is computed on the client; nothing is refetched to tick.
 */
import { useEffect, useRef, useState } from "react"

export const LEASE_FAST_BELOW_MS = 10 * 60000
const SLOW_TICK_MS = 30000
const FAST_TICK_MS = 1000

export function useLeaseClock(expiresAt: string[], enabled: boolean, onExpired?: () => void): number {
  const [now, setNow] = useState(() => Date.now())
  const callback = useRef(onExpired)
  useEffect(() => { callback.current = onExpired })
  const key = expiresAt.join("|")

  useEffect(() => {
    if (!enabled) return
    const targets = key ? key.split("|").map((value) => new Date(value).getTime()).filter((value) => !Number.isNaN(value)) : []
    if (targets.length === 0) return
    const fired = new Set<number>()
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const current = Date.now()
      setNow(current)
      const ended = targets.filter((target) => target <= current && !fired.has(target))
      ended.forEach((target) => fired.add(target))
      if (ended.length > 0) callback.current?.()
      const left = targets.filter((target) => target > current).map((target) => target - current)
      if (left.length === 0) return
      const soonest = Math.min(...left)
      const delay = soonest <= LEASE_FAST_BELOW_MS ? FAST_TICK_MS : Math.min(SLOW_TICK_MS, soonest - LEASE_FAST_BELOW_MS)
      timer = setTimeout(tick, Math.max(1, Math.min(delay, soonest)))
    }
    // Catch up at once (the list may have been closed for a while), then keep ticking.
    tick()
    return () => clearTimeout(timer)
  }, [key, enabled])

  return now
}
