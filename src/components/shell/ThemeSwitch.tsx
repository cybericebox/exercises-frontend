"use client"

import { useEffect, useRef, useState } from "react"
import { Monitor, Moon, Sun } from "lucide-react"
import { t } from "@/i18n/t"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { readThemeChoice, setThemeChoice, watchSystemTheme, type ThemeChoice } from "@/lib/theme"

const OPTIONS = [
  { value: "light", icon: Sun, label: "theme.light" },
  { value: "dark", icon: Moon, label: "theme.dark" },
  { value: "system", icon: Monitor, label: "theme.system" },
] as const

export function ThemeSwitch() {
  const [choice, setChoice] = useState<ThemeChoice>("system")
  const choiceRef = useRef<ThemeChoice>("system")

  useEffect(() => {
    const stored = readThemeChoice()
    choiceRef.current = stored
    queueMicrotask(() => setChoice(stored))
    return watchSystemTheme(() => choiceRef.current)
  }, [])

  function select(next: ThemeChoice) {
    choiceRef.current = next
    setChoice(next)
    setThemeChoice(next)
  }

  return <div role="radiogroup" aria-label={t("theme.label")} className="inline-flex items-center gap-0.5 rounded-md border border-border p-0.5">
    {OPTIONS.map(({ value, icon: Icon, label }) => <HoverTooltip key={value} text={t(label)}><button type="button" role="radio" aria-checked={choice === value} aria-label={t(label)} onClick={() => select(value)} className={`inline-flex h-8 w-8 items-center justify-center rounded-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${choice === value ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}><Icon className="h-4 w-4" /></button></HoverTooltip>)}
  </div>
}
