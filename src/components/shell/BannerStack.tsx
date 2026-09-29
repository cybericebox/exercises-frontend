"use client"

import { useEffect, useState } from "react"
import DOMPurify from "isomorphic-dompurify"
import { X } from "lucide-react"
import { apiGet, apiPatch } from "@/api/client"
import { onServiceRestored } from "@/lib/serviceStatus"

type Banner = {
  ID: string
  Title: string
  Body: string
  Link: string
  Tone?: string
  Dismissible: boolean
}

function safeHref(href: string): string | null {
  const trimmed = href.trim()
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return null
}

export function BannerStack() {
  const [banners, setBanners] = useState<Banner[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    const refresh = () => {
      if (document.visibilityState === "hidden") return
      apiGet<Banner[]>("/api/notifications/banners")
        .then((items) => { if (active) setBanners(items ?? []) })
        .catch(() => { /* A banner outage must not block administration. */ })
    }
    refresh()
    const unsubscribe = onServiceRestored(refresh)
    const timer = window.setInterval(refresh, 10_000)
    document.addEventListener("visibilitychange", refresh)
    return () => { active = false; unsubscribe(); window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh) }
  }, [])

  const current = banners[0]
  if (!current) return null
  const link = safeHref(current.Link ?? "")

  async function dismiss() {
    if (!current || !current.Dismissible) return
    setBusy(true)
    setError(false)
    try {
      await apiPatch(`/api/notifications/banners/${encodeURIComponent(current.ID)}/dismiss`, {})
      setBanners((items) => items.filter((item) => item.ID !== current.ID))
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return <div role="status" aria-live="polite" className="border-b border-border bg-[var(--ib-soft)] px-4 py-3 md:px-6">
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-foreground">{current.Title}</p><div className="mt-0.5 text-sm text-foreground" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(current.Body ?? "") }} />{link && <a href={link} className="mt-1 inline-block text-sm font-medium text-primary underline-offset-2 hover:underline">Докладніше</a>}{error && <p className="mt-1 text-xs text-destructive">Не вдалося закрити банер. Спробуйте ще раз.</p>}</div>
      {current.Dismissible && <button type="button" aria-label="Закрити банер" title="Закрити банер" disabled={busy} onClick={() => void dismiss()} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"><X className="h-4 w-4" /></button>}
    </div>
  </div>
}
