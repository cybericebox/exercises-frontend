type ChunkRecovery = {
  recover: (error: unknown) => boolean
  retry: (error: unknown, fallback: () => void) => void
  subscribe: (listener: (error: Error) => void) => () => void
}
type RecoveryWindow = Window & {__cibChunkRecovery?: ChunkRecovery}

/** Self-contained: also serialized into the head, before the Next runtime loads. */
export function installChunkRecovery(browser: Window): ChunkRecovery {
  const win = browser as RecoveryWindow
  if (win.__cibChunkRecovery) return win.__cibChunkRecovery
  const key = "cib:chunk-recovery-at"
  const quietPeriod = 60_000
  let attempted = false
  let failure: Error | null = null
  const subscribers = new Set<(error: Error) => void>()

  const isChunkURL = (source: string) => {
    try {
      const url = new URL(source, win.location.href)
      return url.origin === win.location.origin && /^\/_next\/static\/chunks\/.+\.js$/.test(url.pathname)
    } catch { return false }
  }
  const isChunkFailure = (reason: unknown) => {
    if (!reason || (typeof reason !== "object" && typeof reason !== "string")) return false
    const value = typeof reason === "string" ? {message: reason, name: ""} : reason as {name?: unknown; message?: unknown}
    if (value.name === "ChunkLoadError") return true
    if (typeof value.message !== "string") return false
    const message = value.message
    if (/^Loading chunk \S+ failed[.\n]/i.test(message)) return true
    // Safari does not include the URL in this specific dynamic-import error.
    if (/^Importing a module script failed\.?$/.test(message)) return true
    if (!/^(?:Failed to fetch dynamically imported module|error loading dynamically imported module|Failed to load chunk)\b/i.test(message)) return false
    const source = message.match(/(?:https?:\/\/[^\s)'"<>]+|\/_next\/static\/chunks\/[^\s)'"<>]+)/)?.[0]
    return !!source && isChunkURL(source)
  }
  const recovery: ChunkRecovery = {
    recover(reason) {
      if (!isChunkFailure(reason) || attempted) return false
      // Never retry in this document, even after time passes or if storage/reload throws.
      attempted = true
      try {
        const now = Date.now()
        const stored = win.sessionStorage.getItem(key)
        const previous = stored === null ? NaN : Number(stored)
        // A future timestamp (clock change) also suppresses another automatic reload.
        if (Number.isFinite(previous) && now - previous < quietPeriod) return false
        win.sessionStorage.setItem(key, String(now))
        win.location.reload()
        return true
      } catch {
        // Without persistent storage a reload could loop: leave the regular error UI.
        return false
      }
    },
    retry(reason, fallback) {
      // Explicit user action may reload again; keep the automatic guard intact.
      if (isChunkFailure(reason)) win.location.reload()
      else fallback()
    },
    subscribe(listener) {
      subscribers.add(listener)
      if (failure) listener(failure)
      return () => { subscribers.delete(listener) }
    },
  }
  win.__cibChunkRecovery = recovery
  const handleFailure = (reason: unknown) => {
    if (!isChunkFailure(reason) || recovery.recover(reason)) return
    failure = reason instanceof Error ? reason : Object.assign(new Error(typeof reason === "string" ? reason : "ChunkLoadError"), {name: "ChunkLoadError"})
    subscribers.forEach(listener => listener(failure!))
  }
  win.addEventListener("unhandledrejection", event => handleFailure(event.reason))
  // Capture resource errors: they do not bubble and can precede React hydration.
  win.addEventListener("error", event => {
    const target = event.target as HTMLScriptElement | null
    if (target?.tagName === "SCRIPT" && isChunkURL(target.src)) {
      handleFailure({name: "ChunkLoadError", message: `Loading chunk failed: ${target.src}`})
    } else if (event.error) handleFailure(event.error)
  }, true)
  return recovery
}

export const CHUNK_RECOVERY_BOOT_SCRIPT = `;(${installChunkRecovery.toString()})(window);`
