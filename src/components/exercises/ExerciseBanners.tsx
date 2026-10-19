"use client"

import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"

export function VersionBanner({ label, canRestore, busy, restoring = false, onBack, onRestore }: {
  label: string
  canRestore: boolean
  busy: boolean
  /** The restore itself runs: its button names it. */
  restoring?: boolean
  onBack: () => void
  onRestore: () => void
}) {
  return <div role="note" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg bg-primary/10 px-3.5 py-2.5 text-sm text-primary">
    <span>{label}</span>
    <span className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" onClick={onBack}>{t("admin.exPage.version.back")}</Button>
      {canRestore && <Button type="button" size="sm" busy={restoring} disabled={busy} onClick={onRestore}>{t(restoring ? "admin.exPage.version.restoring" : "admin.exPage.version.restore")}</Button>}
    </span>
  </div>
}

export function ArchivedBanner({ canUnarchive, busy, unarchiving = false, onUnarchive }: { canUnarchive: boolean; busy: boolean; unarchiving?: boolean; onUnarchive: () => void }) {
  return <div role="note" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">
    <span>{t("admin.exPage.archived.banner")}</span>
    {canUnarchive && <Button type="button" size="sm" variant="outline" busy={unarchiving} disabled={busy} onClick={onUnarchive}>
      {t(unarchiving ? "admin.exPage.action.unarchiving" : "admin.exPage.action.unarchive")}
    </Button>}
  </div>
}
