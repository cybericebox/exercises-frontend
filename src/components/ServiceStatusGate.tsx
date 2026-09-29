"use client"

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { CloudOff } from "lucide-react"

import { Wordmark } from "@/components/brand/Wordmark"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { apiOrigin } from "@/lib/origins"
import { confirmServiceUnavailable, getServiceStatus, reportServiceAvailable, subscribeServiceStatus } from "@/lib/serviceStatus"

const POLL_MS = 5000
const CONFIRM_MS = 12000

async function probe(): Promise<boolean> {
  try {
    // /api/health is only a liveness check; /me also proves session storage works.
    const response = await fetch(`${apiOrigin}/api/auth/me`, { cache: "no-store", credentials: "include", signal: AbortSignal.timeout(3000) })
    return response.ok || response.status === 401
  } catch {
    return false
  }
}

export function ServiceStatusGate() {
  const status = useSyncExternalStore(subscribeServiceStatus, getServiceStatus, () => "up" as const)
  const [checking, setChecking] = useState(false)
  const checkingRef = useRef(false)

  const retry = useCallback(async () => {
    if (checkingRef.current) return
    checkingRef.current = true
    setChecking(true)
    try {
      if (await probe()) {
        reportServiceAvailable()
        // Revalidate /me and refetch failed page data on the current admin URL.
        window.location.reload()
      }
    } finally {
      checkingRef.current = false
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    if (status !== "suspect") return
    const id = window.setTimeout(async () => {
      if (await probe()) reportServiceAvailable()
      else confirmServiceUnavailable()
    }, CONFIRM_MS)
    return () => window.clearTimeout(id)
  }, [status])

  useEffect(() => {
    if (status !== "down") return
    const id = window.setInterval(() => { void retry() }, POLL_MS)
    return () => window.clearInterval(id)
  }, [status, retry])

  if (status !== "down") return null

  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="service-down-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 p-4">
      <div className="flex w-full max-w-md flex-col">
        <div className="mb-6 flex justify-center"><Wordmark size="lg" href={null} /></div>
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-8 text-center">
          <CloudOff size={32} className="text-muted-foreground" aria-hidden />
          <h1 id="service-down-title" className="text-lg font-semibold">{t("error.unavailableTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("error.unavailableBody")}</p>
          <Button variant="outline" size="sm" onClick={() => { void retry() }} disabled={checking} className="mt-2">
            {checking ? t("admin.loading") : t("error.retry")}
          </Button>
        </div>
      </div>
    </div>
  )
}
