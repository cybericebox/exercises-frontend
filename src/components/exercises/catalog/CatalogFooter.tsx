"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { SelectMenu } from "@/components/ui/select-menu"
import { t } from "@/i18n/t"

const PAGE_SIZES = [25, 50, 100]

/** The bottom line of the catalog table: which rows of how many, the page size and the page arrows. */
export function CatalogFooter({ page, pageSize, total, shown, onPage, onPageSize }: {
  page: number
  pageSize: number
  total: number
  /** Rows on this page. */
  shown: number
  onPage: (page: number) => void
  /** Absent: no page-size choice (phone cards). */
  onPageSize?: (size: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = total === 0 ? 0 : from + Math.max(shown, 1) - 1
  const arrow = (label: string, disabled: boolean, next: number, Icon: typeof ChevronLeft) => <HoverTooltip text={label}>
    <button type="button" className="catalog-tool" aria-label={label} disabled={disabled} onClick={() => onPage(next)}><Icon aria-hidden="true" /></button>
  </HoverTooltip>
  return <div className="catalog-footer">
    <span aria-live="polite">{t("exercises.catalog.range", { from, to, total })}</span>
    <span className="flex-1" />
    {onPageSize && <><span className="hidden sm:inline">{t("admin.table.perPage")}</span>
    <SelectMenu value={String(pageSize)} onChange={(value) => onPageSize(Number(value))}
      options={PAGE_SIZES.map((value) => ({ value: String(value), label: String(value) }))} ariaLabel={t("admin.table.perPage")} className="w-20" /></>}
    {pages > 1 && <>
      {arrow(t("admin.table.previous"), page <= 1, page - 1, ChevronLeft)}
      {arrow(t("admin.table.next"), page >= pages, page + 1, ChevronRight)}
    </>}
  </div>
}
