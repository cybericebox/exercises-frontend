"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Copy, ExternalLink } from "lucide-react"
import { CopyActionTooltip } from "./CopyActionTooltip"

export type CopyBlockProps = {
  value: string
  labels: { copy: string; copied: string; open: string; copyFailed?: string }
  openUrl?: string
  onOpen?: (url: string) => void
}

/** Copy exact resolved text; only a complete HTTP(S) value can be opened. */
export function copyBlockUrl(value: string): string | null {
  if (!/^https?:\/\//i.test(value) || /[\s\\]/.test(value)) return null
  try {
    const url = new URL(value)
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password ? url.href : null
  } catch { return null }
}

export function CopyBlock({ value, labels, openUrl, onOpen }: CopyBlockProps) {
  const [feedback, setFeedback] = useState<{ value: string; state: "copied" | "error" } | null>(null)
  const [renderedValue, setRenderedValue] = useState(value)
  if (renderedValue !== value) { setRenderedValue(value); setFeedback(null) }
  const lifecycle = useRef<{ mounted: boolean; attempt: number; timer: ReturnType<typeof setTimeout> | null }>({ mounted: false, attempt: 0, timer: null })
  useEffect(() => {
    const state = lifecycle.current
    state.mounted = true
    return () => { state.mounted = false; state.attempt++; if (state.timer) clearTimeout(state.timer) }
  }, [])
  useEffect(() => {
    const state = lifecycle.current
    return () => { state.attempt++; if (state.timer) clearTimeout(state.timer) }
  }, [value])
  const copied = feedback?.value === value && feedback.state === "copied"
  const failed = feedback?.value === value && feedback.state === "error"
  const href = copyBlockUrl(openUrl ?? value)
  const action = "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
  async function copy() {
    const state = lifecycle.current
    const id = ++state.attempt
    if (state.timer) clearTimeout(state.timer)
    try {
      await navigator.clipboard.writeText(value)
      if (!state.mounted || id !== state.attempt) return
      setFeedback({ value, state: "copied" })
      state.timer = setTimeout(() => setFeedback(null), 2000)
    } catch {
      if (state.mounted && id === state.attempt) setFeedback({ value, state: "error" })
    }
  }
  return <div data-copy-block className="my-2 flex h-9 min-w-0 max-w-full items-center gap-1 rounded-md border border-border bg-muted/50 px-2">
    <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre font-mono text-sm">{value}</code>
    <CopyActionTooltip text={copied ? labels.copied : labels.copy}><button type="button" className={action} aria-label={copied ? labels.copied : labels.copy} onClick={() => void copy()}>
      {copied ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : <Copy aria-hidden="true" className="h-3.5 w-3.5" />}
    </button></CopyActionTooltip>
    {href && <CopyActionTooltip text={labels.open}><button type="button" className={action} aria-label={labels.open}
      onClick={() => { if (onOpen) onOpen(href); else window.open(href, "_blank", "noopener,noreferrer") }}><ExternalLink aria-hidden="true" className="h-3.5 w-3.5" /></button></CopyActionTooltip>}
    <span role="status" className="sr-only">{copied ? labels.copied : failed ? (labels.copyFailed ?? labels.copy) : ""}</span>
  </div>
}
