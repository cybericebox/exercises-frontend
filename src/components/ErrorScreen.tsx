"use client"

import { TriangleAlert } from "lucide-react"

import { Wordmark } from "@/components/brand/Wordmark"
import { Button } from "@/components/ui/button"
import { errorCode } from "@/components/ui/load-error"
import { t } from "@/i18n/t"

// Browser history back; a tab opened straight on the failing page goes home instead.
export function goBack() {
  if (window.history.length > 1) window.history.back()
  // a full load leaves the failed render state behind
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  else window.location.assign("/")
}

/**
 * Error boundary screen, the ServiceStatusGate card: warning mark, «Оновити» (retry the
 * segment) and «Назад». Shows only the numeric error code (when `error` carries one), never details. app/error.tsx renders it inside the
 * shell (centered in the content area); app/global-error.tsx as a full page with the wordmark.
 */
export function ErrorScreen({ onRetry, fullPage = false, error, title = t("error.page.title") }: { onRetry: () => void; fullPage?: boolean; error?: unknown; title?: string }) {
  const code = errorCode(error)
  return (
    <div className={fullPage ? "flex min-h-screen items-center justify-center p-4" : "flex min-h-full items-center justify-center py-12"}>
      <div className="flex w-full max-w-md flex-col">
        {fullPage && <div className="mb-6 flex justify-center"><Wordmark size="lg" /></div>}
        <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-8 text-center">
          <TriangleAlert size={32} className="text-destructive" aria-hidden />
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{t("error.page.body")}</p>
          {code !== undefined && <p className="font-mono text-xs text-muted-foreground">{t("error.load.code", { code })}</p>}
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Button onClick={onRetry}>{t("error.page.reload")}</Button>
            <Button variant="outline" onClick={goBack}>{t("error.page.back")}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
