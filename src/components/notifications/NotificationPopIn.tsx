"use client"

import { useEffect, useRef, useState } from "react"
import DOMPurify from "isomorphic-dompurify"
import { X } from "lucide-react"
import { NotificationMessageCard } from "./NotificationMessageCard"
import { accentOf } from "./accent"
import { popInDuration } from "./popInDuration"
import { t } from "@/i18n/t"
import { keepBrand } from "@/i18n/brand"

export type PopInMessage = {
  ID: string
  Title: string
  Body: string
  Icon?: string
  Tone?: string
  AccentColor?: string
  AutoDismissMs?: number | null
  Actions?: { label: string; href: string }[] | null
}

function safeHref(value: string): string | null {
  const href = value.trim()
  if (href.startsWith("/") && !href.startsWith("//")) return href
  if (href.startsWith("#") || /^https?:\/\/|^mailto:/i.test(href)) return href
  return null
}

export function NotificationPopIn({ message, onClose, onAction }: {
  message: PopInMessage
  onClose: () => void
  onAction: (href: string) => void
}) {
  const duration = popInDuration(message.AutoDismissMs)
  const action = message.Actions?.find((item) => item.label && safeHref(item.href ?? ""))
  const accent = accentOf({ Tone: message.Tone ?? "neutral", AccentColor: message.AccentColor ?? "" })
  const onCloseRef = useRef(onClose)
  const remaining = useRef(duration)
  const [paused, setPaused] = useState(false)

  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  useEffect(() => { remaining.current = duration }, [duration, message.ID])

  useEffect(() => {
    if (duration <= 0 || paused) return
    const started = Date.now()
    const timer = window.setTimeout(() => onCloseRef.current(), remaining.current)
    return () => {
      window.clearTimeout(timer)
      remaining.current = Math.max(0, remaining.current - (Date.now() - started))
    }
  }, [duration, message.ID, paused])

  return <div role="status" aria-label={t("inbox.new")} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false) }} className="relative w-[min(22.5rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-popover px-4 pb-5 pt-4 text-popover-foreground">
    <button type="button" onClick={onClose} aria-label={t("inbox.dismiss")} className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary">
      <X className="h-4 w-4" />
    </button>
    <div className="pr-5">
      <NotificationMessageCard
        icon={message.Icon}
        tone={message.Tone}
        accentColor={message.AccentColor}
        title={message.Title}
        // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml -- body is sanitized with DOMPurify
        body={message.Body && <div dangerouslySetInnerHTML={{ __html: keepBrand(DOMPurify.sanitize(message.Body)) }} />}
        actions={action && <button type="button" onClick={() => onAction(action.href)} className="text-sm font-medium text-primary underline-offset-2 hover:underline">{action.label}</button>}
      />
    </div>
    {duration > 0 && <span aria-hidden="true" className="absolute bottom-2 left-4 right-4 h-1 overflow-hidden rounded-full bg-secondary">
      <span className="block h-full w-full origin-left" style={{ backgroundColor: accent, animationName: "notification-countdown", animationDuration: `${duration}ms`, animationTimingFunction: "linear", animationFillMode: "forwards", animationPlayState: paused ? "paused" : "running" }} />
    </span>}
  </div>
}
