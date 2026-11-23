"use client"

import { createContext, useContext, type ReactNode } from "react"
import { Info } from "lucide-react"
import { t } from "@/i18n/t"
import { MAX_CONSOLE_CABLES, MAX_CONSOLE_PORTS, MAX_SERIAL_PORTS } from "@/lib/editor/consolePorts"
import { cn } from "@/utils/cn"
import { useResourcesConfig } from "../ResourcesConfigContext"
import { useLabSupport } from "./labCapabilities"

const ConsoleCablesAvailableContext = createContext<boolean | null>(null)

/**
 * Whether a laboratory in use serves console ports and console cables (capabilities.ConsoleCablesAvailable); null while it is
 * not known (an older server): nothing is said then.
 */
export function ConsoleCablesAvailableProvider({ value, children }: { value: boolean | null; children: ReactNode }) {
  return <ConsoleCablesAvailableContext.Provider value={value}>{children}</ConsoleCablesAvailableContext.Provider>
}

export const useConsoleCablesAvailable = (): boolean | null => useContext(ConsoleCablesAvailableContext)

const KernelLogAvailableContext = createContext<boolean | null>(null)

/** Whether a laboratory in use shows the kernel log on a console port (capabilities.KernelLogAvailable); null: not known. */
export function KernelLogAvailableProvider({ value, children }: { value: boolean | null; children: ReactNode }) {
  return <KernelLogAvailableContext.Provider value={value}>{children}</KernelLogAvailableContext.Provider>
}

export const useKernelLogAvailable = (): boolean | null => useContext(KernelLogAvailableContext)

/** The console-line limits of the laboratory: the capabilities, else the defaults of an older server. */
export function useConsoleLimits(): { consolePorts: number; serialPorts: number; cables: number } {
  const config = useResourcesConfig()
  return {
    consolePorts: config?.MaxConsolePortsPerDevice || MAX_CONSOLE_PORTS,
    serialPorts: config?.MaxSerialPortsPerDevice || MAX_SERIAL_PORTS,
    cables: config?.MaxConsoleCablesPerLab || MAX_CONSOLE_CABLES,
  }
}

/**
 * The notice that console cables can be designed (they save and publish) but a lab with them cannot be deployed yet, because no
 * laboratory in use serves them; or that only some laboratories do. Nothing when they are served or nothing is known.
 */
export function ConsoleLinesNotice({ className }: { className?: string }) {
  const available = useConsoleCablesAvailable()
  const support = useLabSupport()("consoleCables")
  const text = available === false ? t("ed.c.port.unavailable") : support.state === "warn" ? t("ed.c.port.someLabs") : null
  if (!text) return null
  return <div role="note" data-console-notice className={cn("flex items-start gap-2 rounded-lg border border-[var(--ib-warn)] bg-[var(--ib-warn-bg)] px-3 py-2 text-sm text-foreground", className)}>
    <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ib-warn)]" /><span>{text}</span>
  </div>
}
