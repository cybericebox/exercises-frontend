"use client"

import { t } from "@/i18n/t"
import { useReturnContext } from "./ReturnContext"

/** Top bar link back to the event that opened the catalog. */
export function ReturnBar() {
  const { returnUrl } = useReturnContext()
  if (!returnUrl) return null
  return (
    <div className="flex min-h-10 items-center border-b border-border bg-[var(--ib-surface)] px-4 md:px-6">
      <a href={returnUrl} className="text-sm font-medium text-primary hover:underline">
        ← {t("exercises.returnToEvent")}
      </a>
    </div>
  )
}
