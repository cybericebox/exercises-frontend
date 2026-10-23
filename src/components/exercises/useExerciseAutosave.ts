"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AutosaveQueue, type AutosaveStatus } from "@/lib/autosaveQueue"

export type UseExerciseAutosaveOptions = {
  isReplacementFenced?: () => boolean
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
  prepareReplacement: () => Promise<boolean>
  resumeReplacement: () => void
  finishReplacement: () => Promise<void>
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
  const replacementRef = useRef(false)
  const fenced = useCallback(() => replacementRef.current || Boolean(optionsRef.current.isReplacementFenced?.()), [])
  const bufferTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queueRef = useRef<AutosaveQueue | null>(null)

  const cancelBufferWrite = useCallback(() => {
    if (bufferTimer.current !== null) clearTimeout(bufferTimer.current)
    bufferTimer.current = null
  }, [])

  const writeBufferNow = useCallback(() => {
    cancelBufferWrite()
    if (!fenced()) optionsRef.current.writeBuffer()
  }, [cancelBufferWrite, fenced])

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
      if (!fenced() && queue?.hasUnsaved()) {
        writeBufferNow()
        void queue.flush()
      }
    }
  }, [cancelBufferWrite, writeBufferNow, fenced])

  const markChanged = useCallback(() => {
    if (fenced()) return
    queueRef.current?.markChanged()
    cancelBufferWrite()
    bufferTimer.current = setTimeout(() => {
      bufferTimer.current = null
      if (!fenced()) optionsRef.current.writeBuffer()
    }, BUFFER_DELAY_MS)
  }, [cancelBufferWrite, fenced])

  const flush = useCallback(async () => {
    if (fenced()) return true
    const queue = queueRef.current
    if (!queue) return true
    const ok = await queue.flush()
    if (!ok && queue.hasUnsaved()) writeBufferNow()
    return ok
  }, [writeBufferNow, fenced])

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
      if (fenced()) return
      if (document.visibilityState !== "hidden" || !queue?.hasUnsaved()) return
      writeBufferNow()
      void queue.flush()
    }
    const onPageHide = () => {
      const queue = queueRef.current
      if (fenced() || !queue?.hasUnsaved()) return
      writeBufferNow()
      optionsRef.current.sendKeepalive()
    }
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("pagehide", onPageHide)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("pagehide", onPageHide)
    }
  }, [writeBufferNow, fenced])

  const prepareReplacement = useCallback(async () => {
    replacementRef.current = true
    cancelBufferWrite()
    const ok = await (queueRef.current?.flush() ?? Promise.resolve(true))
    if (!ok) {
      replacementRef.current = false
      // Failed drain is never a discard; retain the exact entered values.
      optionsRef.current.writeBuffer()
    }
    return ok
  }, [cancelBufferWrite])
  const resumeReplacement = useCallback(() => { replacementRef.current = false }, [])
  const finishReplacement = useCallback(async () => {
    await discard()
    replacementRef.current = false
  }, [discard])
  return useMemo(() => ({ status, markChanged, flush, hasUnsaved, discard, prepareReplacement, resumeReplacement, finishReplacement }), [status, markChanged, flush, hasUnsaved, discard, prepareReplacement, resumeReplacement, finishReplacement])
}
