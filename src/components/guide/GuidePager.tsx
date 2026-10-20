"use client"

import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { GUIDE_ORDER, guideHref, type GuidePageSlug } from "@/content/guide/registry"
import { t } from "@/i18n/t"

/** Previous / next page of the guide (detail pages only; the first detail page points back to the overview). */
export function GuidePager({ slug }: { slug: GuidePageSlug }) {
  const index = GUIDE_ORDER.indexOf(slug)
  const prev = index > 0 ? GUIDE_ORDER[index - 1] : null
  const next = index < GUIDE_ORDER.length - 1 ? GUIDE_ORDER[index + 1] : null
  return <nav className="g-pager" aria-label={t("exercises.guide.pagerLabel")}>
    {prev ? <Link href={guideHref(prev)} rel="prev" aria-label={t("exercises.guide.prev", { title: t(`exercises.guide.nav.${prev}`) })}>
      <ChevronLeft aria-hidden="true" />{t(`exercises.guide.nav.${prev}`)}
    </Link> : <span />}
    {next ? <Link href={guideHref(next)} rel="next" aria-label={t("exercises.guide.next", { title: t(`exercises.guide.nav.${next}`) })}>
      {t(`exercises.guide.nav.${next}`)}<ChevronRight aria-hidden="true" />
    </Link> : <span />}
  </nav>
}
