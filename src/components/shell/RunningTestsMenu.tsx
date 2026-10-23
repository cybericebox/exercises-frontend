"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { Server } from "lucide-react"

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
  const running = items.length > 0
  // A lab whose lease is over only waits to be ended: it is listed, but not counted as running.
  const active = items.filter((item) => !item.Expired).length
  if (!running && !open) return null
  return <>
    <Button type="button" variant="outline" size="sm" data-running-tests onClick={() => setOpen(true)}>
      <Server aria-hidden="true" size={16} className="md:mr-1.5" />
      {/* On a phone the label is for screen readers only: the count stays visible beside the icon. */}
      <span data-running-count aria-hidden="true" className="ml-1 tabular-nums md:hidden">{active > 0 ? active : items.length}</span>
      <span className="sr-only md:not-sr-only">{active > 0 ? t("admin.exTest.running", { n: active }) : t("admin.exTest.endingLabs", { n: items.length })}</span>
    </Button>
    <RunningLabsDialog open={open && running} items={items} onExpired={() => void refresh()} onClose={() => setOpen(false)}
      onEnded={(id) => { forget(id); setTimeout(() => void refresh(), 1500) }} />
  </>
}
