"use client"

import { useEffect, useState, type ReactNode } from "react"
import { Check, Copy } from "lucide-react"
import { t } from "@/i18n/t"
import { cn } from "@/utils/cn"

/**
 * A copy button: copies `text`, then shows «Скопійовано» for two seconds (or «Не вдалося скопіювати»).
 * Both labels share one grid cell, so the button keeps its width.
 */
export function CopyButton({ text, label, icon, ariaLabel, className }: { text: string; label: string; icon?: ReactNode; ariaLabel?: string; className?: string }) {
  const [feedback, setFeedback] = useState<"idle" | "copied" | "error">("idle")
  useEffect(() => {
    if (feedback === "idle") return
    const timer = window.setTimeout(() => setFeedback("idle"), 2000)
    return () => window.clearTimeout(timer)
  }, [feedback])

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setFeedback("copied")
    } catch {
      setFeedback("error")
    }
  }

  const shown = feedback === "copied" ? t("exercises.guide.copied") : feedback === "error" ? t("exercises.guide.copyFailed") : label
  return <>
    <button type="button" className={cn("g-copy", feedback === "copied" && "is-copied", className)} aria-label={feedback === "idle" ? ariaLabel : shown} onClick={() => void copy()}>
      {feedback === "copied" ? <Check aria-hidden="true" /> : icon ?? <Copy aria-hidden="true" />}
      <span className="g-copy__labels">
        <span aria-hidden={feedback !== "idle"} className={feedback !== "idle" ? "invisible" : undefined}>{label}</span>
        {feedback !== "idle" && <span className="g-copy__now">{shown}</span>}
      </span>
    </button>
    <span role="status" aria-live="polite" className="sr-only">{feedback === "copied" ? t("exercises.guide.copied") : feedback === "error" ? t("exercises.guide.copyFailed") : ""}</span>
  </>
}
