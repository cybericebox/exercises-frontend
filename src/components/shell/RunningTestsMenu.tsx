"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { FlaskConical } from "lucide-react"

import { RunningLabsDialog, timeLeft } from "@/components/exercises/RunningLabsDialog"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { useActiveDeploys } from "@/lib/useActiveDeploys"

export { timeLeft }

/**
 * The navbar's indicator of the user's running test labs: «Запущено лабораторій: N», which
 * opens a modal listing each lab to open or end. Hidden with none; a refresh keeps the
 * previous list, so it never flickers.
 */
export function RunningTestsMenu() {
  const { items, refresh, forget } = useActiveDeploys(null, true)
  // A test may have been started or ended on another page: look again whenever the page changes.
  const pathname = usePathname()
  useEffect(() => { void refresh() }, [pathname, refresh])
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const running = items.length > 0
  // A lab whose lease is over only waits to be ended: it is listed, but not counted as running.
  const active = items.filter((item) => !item.Expired).length
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [running])
  if (!running && !open) return null
  return <>
    <Button type="button" variant="outline" size="sm" data-running-tests onClick={() => { setNow(Date.now()); setOpen(true) }}>
      <FlaskConical aria-hidden="true" size={16} className="mr-1.5" />{active > 0 ? t("admin.exTest.running", { n: active }) : t("admin.exTest.endingLabs", { n: items.length })}
    </Button>
    <RunningLabsDialog open={open && running} items={items} now={now} onClose={() => setOpen(false)}
      onEnded={(id) => { forget(id); setTimeout(() => void refresh(), 1500) }} />
  </>
}
