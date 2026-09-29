"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AutosaveQueue, type AutosaveStatus } from "@/lib/autosaveQueue"

export type UseExerciseAutosaveOptions = {
  delayMs?: number
  save: () => Promise<boolean>
  onSaved?: () => void
  writeBuffer: () => void
  clearBuffer: () => void
  sendKeepalive: () => void
}

export type ExerciseAutosave = {
  status: AutosaveStatus
  markChanged: () => void
  flush: () => Promise<boolean>
  hasUnsaved: () => boolean
  discard: () => Promise<void>
}

const BUFFER_DELAY_MS = 300

/**
 * Autosave for the exercise page: ~1 s debounce, one request at a time,
 * edits made during a request go out in one follow-up. Unconfirmed edits are
 * mirrored to the browser buffer; the tab hiding forces a save and pagehide
 * sends a keepalive request.
 */
export function useExerciseAutosave(options: UseExerciseAutosaveOptions): ExerciseAutosave {
  const [status, setStatus] = useState<AutosaveStatus>("idle")
  const optionsRef = useRef(options)
  useEffect(() => { optionsRef.current = options })
  const bufferTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queueRef = useRef<AutosaveQueue | null>(null)

  const cancelBufferWrite = useCallback(() => {
    if (bufferTimer.current !== null) clearTimeout(bufferTimer.current)
    bufferTimer.current = null
  }, [])

  const writeBufferNow = useCallback(() => {
    cancelBufferWrite()
    optionsRef.current.writeBuffer()
  }, [cancelBufferWrite])

  // Constructed once on mount; every callback below reaches it through the ref,
  // never through a render-scoped local, so a fresh `options` never forces a new queue.
  // Never disposed: the same cleanup that would dispose it is also the one place that
  // must still be able to flush an unsaved change left at unmount, so instead of
  // disposing we just let an orphaned queue (nothing dirty, no timer) get collected —
  // StrictMode's simulated unmount always finds it inert since nothing has changed yet.
  useEffect(() => {
    queueRef.current = new AutosaveQueue({
      delayMs: optionsRef.current.delayMs ?? 1000,
      save: () => optionsRef.current.save(),
      onStatus: setStatus,
      onSaved: () => {
        cancelBufferWrite()
        optionsRef.current.clearBuffer()
        optionsRef.current.onSaved?.()
      },
    })
    return () => {
      const queue = queueRef.current
      if (queue?.hasUnsaved()) {
        writeBufferNow()
        void queue.flush()
      }
    }
  }, [cancelBufferWrite, writeBufferNow])

  const markChanged = useCallback(() => {
    queueRef.current?.markChanged()
    cancelBufferWrite()
    bufferTimer.current = setTimeout(() => {
      bufferTimer.current = null
      optionsRef.current.writeBuffer()
    }, BUFFER_DELAY_MS)
  }, [cancelBufferWrite])

  const flush = useCallback(async () => {
    const queue = queueRef.current
    if (!queue) return true
    const ok = await queue.flush()
    if (!ok && queue.hasUnsaved()) writeBufferNow()
    return ok
  }, [writeBufferNow])

  const hasUnsaved = useCallback(() => queueRef.current?.hasUnsaved() ?? false, [])

  const discard = useCallback(async () => {
    cancelBufferWrite()
    optionsRef.current.clearBuffer()
    await queueRef.current?.discard()
    if (!queueRef.current?.hasUnsaved()) setStatus("idle")
  }, [cancelBufferWrite])

  useEffect(() => {
    const onVisibility = () => {
      const queue = queueRef.current
      if (document.visibilityState !== "hidden" || !queue?.hasUnsaved()) return
      writeBufferNow()
      void queue.flush()
    }
    const onPageHide = () => {
      const queue = queueRef.current
      if (!queue?.hasUnsaved()) return
      writeBufferNow()
      optionsRef.current.sendKeepalive()
    }
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("pagehide", onPageHide)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("pagehide", onPageHide)
    }
  }, [writeBufferNow])

  return useMemo(() => ({ status, markChanged, flush, hasUnsaved, discard }), [status, markChanged, flush, hasUnsaved, discard])
}
