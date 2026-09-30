"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { FlaskConical } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { t } from "@/i18n/t"
import { testLabHref } from "@/lib/exerciseRoutes"
import { useActiveDeploys } from "@/lib/useActiveDeploys"
import { useExerciseNames } from "@/lib/useExerciseNames"

/** "1:42" — hours and minutes left, rounded up; "0:00" at the end. */
export function timeLeft(expiresAt: string, now: number): string {
  const minutes = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 60000))
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`
}

/**
 * The navbar's indicator of the user's running test labs: «Запущено лабораторій: N» and a
 * menu with each lab (exercise, time left) linking to its testing page. Hidden with none;
 * a refresh keeps the previous list, so it never flickers.
 */
export function RunningTestsMenu() {
  const { items, refresh } = useActiveDeploys(null, true)
  // A test may have been started or ended on another page: look again whenever the page changes.
  const pathname = usePathname()
  useEffect(() => { void refresh() }, [pathname, refresh])
  const names = useExerciseNames(items.map((item) => item.ExerciseID))
  const [now, setNow] = useState(() => Date.now())
  const running = items.length > 0
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [running])
  if (!running) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" data-running-tests>
          <FlaskConical aria-hidden="true" size={16} className="mr-1.5" />{t("admin.exTest.running", { n: items.length })}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>{t("admin.exTest.runningTitle")}</DropdownMenuLabel>
        {items.map((item) => (
          <DropdownMenuItem key={item.DeployID} asChild>
            <Link href={testLabHref(item.ExerciseID, item.DeployID)} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate">{names[item.ExerciseID] ?? t("admin.exTest.unknownExercise")}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{t("admin.exTest.left", { time: timeLeft(item.ExpiresAt, now) })}</span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
