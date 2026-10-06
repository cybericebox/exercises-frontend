"use client"

import { Button } from "@/components/ui/button"
import { SelectMenu } from "@/components/ui/select-menu"
import { t } from "@/i18n/t"

const PAGE_SIZES = [25, 50, 100]

// A background page change never shows a loader or disables the buttons: the rows stay until the next page arrives.
export function TablePagination({ page, pageSize, total, onPage, onPageSize }: {
  page: number
  pageSize: number
  total: number
  onPage: (page: number) => void
  onPageSize: (pageSize: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return <div className="mt-auto grid shrink-0 grid-cols-1 items-center gap-3 pt-3 text-sm text-muted-foreground sm:grid-cols-[1fr_auto_1fr]">
    <span>{t("admin.table.summary", { total, page, pages })}</span>
    <div className="flex items-center gap-2 sm:justify-center">
      <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>{t("admin.table.previous")}</Button>
      <Button type="button" variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>{t("admin.table.next")}</Button>
    </div>
    <div className="flex items-center gap-2 sm:justify-end">
      <span>{t("admin.table.perPage")}</span>
      <SelectMenu value={String(pageSize)} onChange={(value) => onPageSize(Number(value))}
        options={PAGE_SIZES.map((value) => ({ value: String(value), label: String(value) }))}
        ariaLabel={t("admin.table.perPage")} className="w-20" />
    </div>
  </div>
}
