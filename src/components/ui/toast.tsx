"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import { CheckCircle2, CircleAlert, TriangleAlert, X } from "lucide-react"
import { t } from "@/i18n/t"

type Tone = "success" | "warning" | "error"
/** A button in the toast; clicking it closes the toast and runs `onClick`. */
export type ToastAction = { label: string; onClick: () => void }
export type ToastOptions = { action?: ToastAction }
type Toast = { id: number; message: string; tone: Tone; action?: ToastAction }
let nextToastId = 0
const listeners = new Set<(item: Toast) => void>()

function show(tone: Tone, message: string, options?: ToastOptions) {
  const item = { id: ++nextToastId, message, tone, action: options?.action }
  listeners.forEach((listener) => listener(item))
}

export const toast = {
  success: (message: string, options?: ToastOptions) => show("success", message, options),
  warning: (message: string, options?: ToastOptions) => show("warning", message, options),
  error: (message: string, options?: ToastOptions) => show("error", message, options),
}

const toneStyle: Record<Tone, string> = {
  success: "border-[var(--ib-ok)] bg-[var(--ib-ok-bg)] text-foreground",
  warning: "border-[var(--ib-warn)] bg-[var(--ib-warn-bg)] text-foreground",
  error: "border-destructive bg-destructive/15 text-foreground",
}
const iconStyle: Record<Tone, string> = {
  success: "text-[var(--ib-ok)]",
  warning: "text-[var(--ib-warn)]",
  error: "text-destructive",
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  useEffect(() => {
    const receive = (item: Toast) => setItems((current) => [...current.slice(-3), item])
    listeners.add(receive)
    return () => { listeners.delete(receive) }
  }, [])

  useEffect(() => {
    if (items.length === 0) return
    const oldest = items[0]
    const timer = window.setTimeout(() => dismiss(oldest.id), 5000)
    return () => window.clearTimeout(timer)
  }, [items, dismiss])

  return <>
    {children}
    <div className="pointer-events-none fixed left-1/2 top-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2" aria-label={t("ui.toast.region")}>
      {items.map((item) => <div key={item.id} role={item.tone === "success" ? "status" : "alert"} data-tone={item.tone}
        className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${toneStyle[item.tone]}`}>
        {item.tone === "success" ? <CheckCircle2 aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${iconStyle[item.tone]}`} />
          : item.tone === "warning" ? <TriangleAlert aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${iconStyle[item.tone]}`} />
            : <CircleAlert aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${iconStyle[item.tone]}`} />}
        <span className="min-w-0 flex-1">{item.message}</span>
        {item.action && <button type="button" onClick={() => { dismiss(item.id); item.action?.onClick() }}
          className="shrink-0 rounded font-medium text-foreground underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-primary">
          {item.action.label}
        </button>}
        <button type="button" aria-label={t("ui.toast.close", { message: item.message })} onClick={() => dismiss(item.id)}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary">
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>)}
    </div>
  </>
}
