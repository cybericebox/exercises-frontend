import type { ReactNode } from "react"
import { NotificationIcon } from "./NotificationIcon"
import { t } from "@/i18n/t"

export type NotificationMessageCardProps = {
  icon?: string
  tone?: string
  accentColor?: string
  title?: string
  body?: ReactNode
  timestamp?: ReactNode
  unread?: boolean
  actions?: ReactNode
  compact?: boolean
}

/** The platform's notification layout. Keep this component self-contained for later copies to other frontends. */
export function NotificationMessageCard({ icon = "bell", tone = "neutral", accentColor = "", title, body, timestamp, unread = false, actions, compact = false }: NotificationMessageCardProps) {
  return <div className="flex min-w-0 items-start gap-3 text-left">
    <NotificationIcon icon={icon} tone={tone} accentColor={accentColor} size={compact ? "sm" : "md"} />
    <div className="min-w-0 flex-1">
      {title && <div className="flex min-w-0 items-start gap-2">
        <p className={`min-w-0 flex-1 break-words text-sm leading-snug text-foreground ${unread ? "font-semibold" : "font-medium"}`}>{title}</p>
        {unread && <span aria-label={t("inbox.unreadItem")} className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
      </div>}
      {body && <div className={`${title ? "mt-1" : ""} break-words text-sm leading-relaxed text-muted-foreground ${compact ? "line-clamp-2" : ""}`}>{body}</div>}
      {timestamp && <div className="mt-1.5 text-xs text-muted-foreground">{timestamp}</div>}
      {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
    </div>
  </div>
}
