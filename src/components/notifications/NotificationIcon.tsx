import { AlertTriangle, Bell, CalendarDays, CheckCircle2, CircleHelp, Info, Mail, ShieldCheck, Trophy, UserRound, XCircle } from "lucide-react"
import type { ComponentType } from "react"
import type { LucideProps } from "lucide-react"
import { accentOf } from "./accent"

const ICONS: Record<string, ComponentType<LucideProps>> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  bell: Bell,
  mail: Mail,
  calendar: CalendarDays,
  user: UserRound,
  shield: ShieldCheck,
  trophy: Trophy,
  help: CircleHelp,
}

export function NotificationIcon({ icon, tone, accentColor, size = "md" }: { icon: string; tone: string; accentColor: string; size?: "sm" | "md" }) {
  const accent = accentOf({ Tone: tone, AccentColor: accentColor })
  const Icon = ICONS[icon] ?? Bell
  return <span
    aria-hidden="true"
    className={`inline-flex shrink-0 items-center justify-center rounded-md ${size === "sm" ? "h-8 w-8" : "h-10 w-10"}`}
    style={{ color: accent, backgroundColor: `color-mix(in srgb, ${accent} 12%, var(--ib-surface))` }}
  >
    <Icon className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} strokeWidth={1.8} />
  </span>
}
