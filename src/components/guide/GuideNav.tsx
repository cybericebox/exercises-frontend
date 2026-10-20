"use client"

import { Fragment, useEffect, useRef } from "react"
import Link from "next/link"
import { BookOpen } from "lucide-react"
import { GUIDE_ORDER, guideHref, type GuidePageSlug } from "@/content/guide/registry"
import { t } from "@/i18n/t"

/** The secondary guide navigation: «Як це влаштовано», then the numbered pages. A scrolling row under 1280px. */
export function GuideNav({ active }: { active: GuidePageSlug }) {
  const nav = useRef<HTMLElement>(null)
  // In the row layout the active page is brought into view (scrolling the row only, never the page).
  useEffect(() => {
    const row = nav.current
    const current = row?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!row || !current || row.scrollWidth <= row.clientWidth) return
    row.scrollLeft = current.offsetLeft - (row.clientWidth - current.offsetWidth) / 2
  }, [active])

  return <nav ref={nav} className="g-nav" aria-label={t("exercises.guide.navLabel")}>
    <div className="g-nav__title">{t("exercises.guide.navTitle")}</div>
    {GUIDE_ORDER.map((slug, index) => <Fragment key={slug}>
      <Link href={guideHref(slug)} aria-current={slug === active ? "page" : undefined}>
        <span className="g-nav__n">{index === 0 ? <BookOpen aria-hidden="true" /> : index}</span>
        <span>{t(`exercises.guide.nav.${slug}`)}</span>
      </Link>
      {index === 0 && <hr aria-hidden="true" />}
    </Fragment>)}
  </nav>
}
