import { t } from "@/i18n/t"

/** «412 МіБ», «1,1 ГіБ»: binary units with at most one decimal, in the page language. */
export function formatBytes(bytes: number): string {
  const [unit, divisor] = bytes >= 1024 ** 3 ? ["gib", 1024 ** 3] as const : bytes >= 1024 ** 2 ? ["mib", 1024 ** 2] as const : ["kib", 1024] as const
  const value = new Intl.NumberFormat("uk", { maximumFractionDigits: unit === "gib" ? 1 : 0 }).format(bytes / divisor)
  return t(`exercises.image.size.${unit}`, { value })
}
