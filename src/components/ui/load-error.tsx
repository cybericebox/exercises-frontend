"use client"

import { TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { cn } from "@/utils/cn"

// Error code carried by an API error: the numeric Status.Code first, then the HTTP status.
function errorCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined
  const { code, status } = error as { code?: unknown; status?: unknown }
  if (typeof code === "number") return code
  return typeof status === "number" && status > 0 ? status : undefined
}

/**
 * The only load-error state inside a page or block: the ErrorScreen warning mark at block
 * scale, a title (the context message), one line of help and «Спробувати ще раз». Same
 * size and centering as EmptyState / LoadingArea, so loading → error never jumps. The
 * error code shows when `error` carries one. A dead route uses ErrorScreen instead.
 */
export function LoadError({ message = t("error.load.title"), onRetry, error, compact = false, className }: {
  message?: string
  onRetry?: () => void
  error?: unknown
  compact?: boolean
  className?: string
}) {
  const code = errorCode(error)
  return (
    <div data-load-error role="alert" className={cn("flex w-full flex-col items-center justify-center px-4 text-center", compact ? "min-h-24 gap-2 py-4" : "min-h-40 gap-3 py-8", className)}>
      <TriangleAlert size={compact ? 20 : 24} className="text-destructive" aria-hidden />
      <p className="text-sm font-medium text-foreground">{message}</p>
      {!compact && <p className="max-w-sm text-sm text-muted-foreground">{t("error.load.body")}</p>}
      {code !== undefined && <p className="font-mono text-xs text-muted-foreground">{t("error.load.code", { code })}</p>}
      {onRetry && <Button variant="outline" size={compact ? "sm" : "default"} onClick={onRetry}>{t("error.load.retry")}</Button>}
    </div>
  )
}
