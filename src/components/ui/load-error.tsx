"use client"

import { TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { cn } from "@/utils/cn"

// Error code carried by an API error: the numeric Status.Code first, then the HTTP status.
export function errorCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined
  const { code, status } = error as { code?: unknown; status?: unknown }
  if (typeof code === "number") return code
  return typeof status === "number" && status > 0 ? status : undefined
}

/**
 * The only load-error state inside a page or block: the ErrorScreen warning mark at block
 * scale, a title (the context message), one line of help and «Спробувати ще раз» (compact too). Same
 * size and centering as EmptyState / LoadingArea, so loading → error never jumps. The
 * error code shows when `error` carries one. A dead route uses ErrorScreen instead.
 */
export function LoadError({ message = t("error.load.title"), help, onRetry, error, compact = false, className, actions, details, retryRef }: {
  message?: string
  /** The help line, when the general «check the connection» one does not fit the failure. */
  help?: string | null
  onRetry?: () => void
  /** Optional logical focus destination when a dialog removes its opener. */
  retryRef?: React.Ref<HTMLButtonElement>
  error?: unknown
  compact?: boolean
  className?: string
  /** Extra buttons next to «Спробувати ще раз» (a way around the failure). */
  actions?: React.ReactNode
  /** What exactly failed, under the title (e.g. the images a deploy could not pull). */
  details?: React.ReactNode
}) {
  const code = errorCode(error)
  return (
    <div data-load-error role="alert" className={cn("flex w-full flex-col items-center justify-center px-4 text-center", compact ? "min-h-24 gap-2 py-4" : "min-h-40 gap-3 py-8", className)}>
      <TriangleAlert size={compact ? 20 : 24} className="text-destructive" aria-hidden />
      <p className="text-sm font-medium text-foreground">{message}</p>
      {details}
      <p className={cn("max-w-sm text-muted-foreground", compact ? "text-xs" : "text-sm")}>{help || t("error.load.body")}</p>
      {code !== undefined && <p className="font-mono text-xs text-muted-foreground">{t("error.load.code", { code })}</p>}
      {(onRetry || actions) && <div className="flex flex-wrap items-center justify-center gap-2">
        {actions}
        {onRetry && <Button ref={retryRef} variant="outline" size={compact ? "sm" : "default"} onClick={onRetry}>{t("error.load.retry")}</Button>}
      </div>}
    </div>
  )
}
