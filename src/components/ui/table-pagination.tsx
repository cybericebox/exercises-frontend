"use client"

import { Button } from "@/components/ui/button"
import { SelectMenu } from "@/components/ui/select-menu"
import { Spinner } from "@/components/ui/spinner"
import { t } from "@/i18n/t"

const PAGE_SIZES = [25, 50, 100]

export function TablePagination({ page, pageSize, total, busy, onPage, onPageSize }: {
  page: number
  pageSize: number
  total: number
  busy?: boolean
  onPage: (page: number) => void
  onPageSize: (pageSize: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return <div className="mt-auto grid shrink-0 grid-cols-1 items-center gap-3 border-t border-border pt-4 text-sm text-muted-foreground sm:grid-cols-[1fr_auto_1fr]">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>{t("admin.table.total")}: {total}</span>
      <span className="whitespace-nowrap">{t("admin.table.page")} {page} {t("admin.table.of")} {pages}</span>
      <span className="inline-flex w-5 justify-center">{busy && <Spinner size="sm" label={t("admin.table.updating")} />}</span>
    </div>
    <div className="flex items-center gap-2 sm:justify-center">
      <Button type="button" variant="outline" size="sm" disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>{t("admin.table.previous")}</Button>
      <Button type="button" variant="outline" size="sm" disabled={busy || page >= pages} onClick={() => onPage(page + 1)}>{t("admin.table.next")}</Button>
    </div>
    <div className="flex items-center gap-2 sm:justify-end">
      <span>{t("admin.table.perPage")}</span>
      <SelectMenu value={String(pageSize)} onChange={(value) => onPageSize(Number(value))}
        options={PAGE_SIZES.map((value) => ({ value: String(value), label: String(value) }))}
        ariaLabel={t("admin.table.perPage")} className="w-20" disabled={busy} />
    </div>
  </div>
}
