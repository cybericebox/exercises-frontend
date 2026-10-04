import { formatCPU, formatMemory } from "@/lib/deviceResources"
import type { Amount } from "@/api/exercises/testLabs"

/** "14:30" — the clock time of an RFC3339 instant in the browser's time zone. */
export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })
}

export function formatAmount(amount: Amount): { cpu: string; memory: string } {
  return { cpu: formatCPU(amount.CPUMillicores), memory: formatMemory(amount.MemoryBytes) }
}
