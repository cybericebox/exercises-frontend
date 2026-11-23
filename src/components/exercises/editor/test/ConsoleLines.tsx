"use client"

import type { DeployStatus } from "@/api/exercises/deploy"
import type { NormalizedTopology } from "@/api/exercises/versions"
import { t } from "@/i18n/t"
import { cableEnds, consoleLineText, lineOf } from "@/lib/labConsole"
import { LineChip } from "./DossierTab"

/**
 * The console lines of the lab, under its devices: each cable (serial end → console end) with the chip of its line, up or down
 * with the reason. Nothing for a lab without console cables.
 */
export function ConsoleLines({ topology, status }: { topology: NormalizedTopology; status: DeployStatus | null }) {
  const cables = cableEnds(topology).filter((ends): ends is NonNullable<typeof ends> => ends !== null)
  if (cables.length === 0) return null
  return <section aria-labelledby="lab-console-lines" data-testid="console-lines" className="mt-4 min-w-0 space-y-2 border-t border-border pt-3">
    <h3 id="lab-console-lines" className="text-xs font-semibold uppercase tracking-wider text-foreground">{t("ed.d.cable.title", { n: cables.length })}</h3>
    {/* A line coming up or going down is said politely, without moving the focus. */}
    <ul aria-live="polite" className="min-w-0 space-y-1.5">{cables.map((ends) => {
      const line = lineOf(status, ends)
      return <li key={`${ends.serial.device}:${ends.serial.port}`} className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-sm">
        <span className="min-w-0 truncate font-mono text-[13px] text-foreground">{t("ed.d.cable.ends", { serialDevice: ends.serial.device, serial: ends.serial.port, consoleDevice: ends.console.device, console: ends.console.port })}</span>
        <LineChip up={line?.LineUp ?? false} pending={!line} label={line ? consoleLineText(line) : t("ed.d.cable.pending")} />
      </li>
    })}</ul>
  </section>
}
