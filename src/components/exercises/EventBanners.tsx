"use client"

import { ArrowLeft } from "lucide-react"
import { t } from "@/i18n/t"

/** Non-admins see catalog exercises as their published version only. */
export function ReadOnlyBanner({ returnUrl }: { returnUrl: string | null }) {
  return (
    <div role="note" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">
      <span>{t("exercises.readOnly.banner")}</span>
      {returnUrl && <a href={returnUrl} className="font-medium text-primary hover:underline">{t("exercises.readOnly.toEvent")}</a>}
    </div>
  )
}

/** After create / publish in an event context: the way back, prominently. */
export function EventReturnCallout({ returnUrl, kind }: { returnUrl: string; kind: "created" | "published" }) {
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg bg-primary/10 px-3.5 py-3 text-sm text-foreground">
      <span>{t(`exercises.return.${kind}`)}</span>
      <a href={returnUrl} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
        <ArrowLeft size={16} aria-hidden="true" />{t("exercises.returnToEvent")}
      </a>
    </div>
  )
}

/** The owner event forbids lab infrastructure: topology and test deploys are off. */
export function InfrastructureBlockedNote() {
  return (
    <p role="note" className="rounded-lg bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">
      {t("exercises.infra.blocked")}
    </p>
  )
}
