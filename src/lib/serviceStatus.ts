export type ServiceStatus = "up" | "suspect" | "down"

let status: ServiceStatus = "up"
const listeners = new Set<(status: ServiceStatus) => void>()
const restoredListeners = new Set<() => void>()

export function isServiceDown(): boolean {
  return status !== "up"
}

export function getServiceStatus(): ServiceStatus {
  return status
}

export function reportServiceUnavailable(): void {
  if (status !== "up") return
  status = "suspect"
  listeners.forEach((listener) => listener(status))
}

export function confirmServiceUnavailable(): void {
  if (status !== "suspect") return
  status = "down"
  listeners.forEach((listener) => listener(status))
}

export function reportServiceAvailable(): void {
  if (status === "up") return
  status = "up"
  listeners.forEach((listener) => listener(status))
  restoredListeners.forEach((listener) => listener())
}

export function subscribeServiceStatus(listener: (status: ServiceStatus) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function onServiceRestored(listener: () => void): () => void {
  restoredListeners.add(listener)
  return () => restoredListeners.delete(listener)
}

export function isUnavailableStatus(status: number): boolean {
  return status >= 500 && status <= 599
}

// Requests cut by leaving the page fail like a network error; they are not outages.
let leaving = false
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => { leaving = true })
  window.addEventListener("pageshow", () => { leaving = false })
}

/**
 * A failed request that may mean the API is unreachable: not one the caller
 * aborted or timed out, and not one cut by the page unloading. Only rejected
 * requests reach here; a 4xx answer never counts.
 */
export function isNetworkOutage(error: unknown, signal?: AbortSignal | null): boolean {
  if (leaving || signal?.aborted) return false
  return !(error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError"))
}

// Short backend restarts must not flash the modal: after the first failure the
// gate waits, probes, waits again and probes again; only when every probe fails
// (about 30 s in all) does the outage show.
export const OUTAGE_GRACE_MS = 15_000
export const OUTAGE_GRACE_PROBES = 2

/**
 * Runs the grace period for a "suspect" status: one probe per OUTAGE_GRACE_MS,
 * a success reports the API as available, and only the last failed probe
 * confirms the outage. Returns a cancel function.
 */
export function startOutageGrace(probe: () => Promise<boolean>): () => void {
  let cancelled = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const step = (left: number) => {
    timer = setTimeout(async () => {
      const ok = await probe()
      if (cancelled) return
      if (ok) reportServiceAvailable()
      else if (left > 1) step(left - 1)
      else confirmServiceUnavailable()
    }, OUTAGE_GRACE_MS)
  }
  step(OUTAGE_GRACE_PROBES)
  return () => {
    cancelled = true
    clearTimeout(timer)
  }
}

// Long enough for a slow answer over a busy connection; a hung API still fails.
const PROBE_TIMEOUT_MS = 10_000

/**
 * The recovery probe: session validation answers below 500 for everyone (200
 * signed in, 401 anonymous) once the API and its storage respond. It goes to
 * the API origin like every other call.
 */
export async function probeService(origin: string): Promise<boolean> {
  if (!origin) return false
  try {
    const response = await fetch(`${origin}/api/auth/me`, {
      credentials: "include", cache: "no-store", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    return !isUnavailableStatus(response.status)
  } catch {
    return false
  }
}
