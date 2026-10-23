"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import type { ExerciseListItem } from "@/api/exercises/catalog"
import { InfrastructureIcon } from "@/components/exercises/OwnershipBadges"
import { t } from "@/i18n/t"
import { accessInfo } from "@/lib/catalogList"
import { cn } from "@/utils/cn"
import { StatusCell, UpdatedCell } from "./CatalogCells"
import { CatalogFooter } from "./CatalogFooter"

/** Who may use the task, in one short line (the card has no popover for the event list). */
function accessLine(item: ExerciseListItem): string {
  const info = accessInfo(item)
  if (info.kind === "event") return info.eventName ? t("exercises.accessCol.event", { name: info.eventName }) : t("exercises.badge.event")
  if (info.kind === "selected") return info.eventIds.length ? t("exercises.accessCol.selectedCount", { count: info.eventIds.length }) : t("exercises.access.level.selected")
  if (info.kind === "unknown") return ""
  return t(`exercises.access.level.${info.kind}`)
}

/**
 * The catalog on a phone: one card per task (name, status, access, counts, author, date), the whole card opens the
 * task. The sort is chosen in the filter sheet; the line above the cards names it.
 */
export function CatalogCards({ rows, sortBy, sortDir, total, page, pageSize, onPage, busy, state }: {
  rows: ExerciseListItem[]
  sortBy: string
  sortDir: "asc" | "desc"
  total: number
  page: number
  pageSize: number
  onPage: (page: number) => void
  busy: boolean
  state?: ReactNode
}) {
  return <div className="catalog-cards" aria-busy={busy}>
    <p className="catalog-cards-meta">{t("exercises.catalog.cardsSort", { field: t(`admin.ex.col.${sortBy}`), dir: sortDir === "asc" ? "↑" : "↓" })}</p>
    {state ? <div className="catalog-cards-state">{state}</div> : <ul aria-label={t("accountMenu.exercises")} className="flex flex-col gap-2">
      {rows.map((item) => <li key={item.ID} className={cn("catalog-card", item.ArchivedAt && "catalog-archived")}>
        <div className="flex items-start gap-2">
          <Link href={`/detail?id=${item.ID}`} className="catalog-card-link min-w-0 flex-1">{item.Name}</Link>
          <InfrastructureIcon show={item.Infrastructure} />
          <StatusCell item={item} compact />
        </div>
        <p className="catalog-card-line">{accessLine(item)}</p>
        <p className="catalog-card-line">
          {item.TaskCount !== null && <span>{t("exercises.catalog.cardSubtasks", { count: item.TaskCount })}</span>}
          {item.VariantCount !== null && <span>{t("exercises.catalog.cardVariants", { count: item.VariantCount })}</span>}
          {item.AuthorName && <span className="min-w-0 truncate">{item.AuthorName}</span>}
          <span className="ml-auto shrink-0"><UpdatedCell iso={item.UpdatedAt} /></span>
        </p>
      </li>)}
    </ul>}
    {!state && <CatalogFooter page={page} pageSize={pageSize} total={total} shown={rows.length} onPage={onPage} />}
  </div>
}
