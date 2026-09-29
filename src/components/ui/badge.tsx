import type { ReactNode } from "react"
import { cn } from "@/utils/cn"

export type BadgeTone = "ok" | "warn" | "neutral" | "muted" | "info"

// Tone tokens are redefined for dark mode in ds-tokens.css. Flat: no shadow.
const TONE: Record<BadgeTone, string> = {
  ok: "bg-[var(--ib-ok-bg)] text-[var(--ib-ok)]",
  warn: "bg-[var(--ib-warn-bg)] text-[var(--ib-warn)]",
  neutral: "bg-secondary/40 text-foreground",
  muted: "bg-muted text-muted-foreground",
  info: "bg-primary/10 text-primary",
}

export function Badge({ tone = "neutral", className, children, ...rest }: { tone?: BadgeTone; className?: string; children: ReactNode } & Record<`data-${string}`, string>) {
  return <span {...rest} className={cn("inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-medium", TONE[tone], className)}>{children}</span>
}
