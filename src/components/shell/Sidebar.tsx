"use client"

import { Fragment, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowLeft, BookOpen, CalendarClock, ClipboardList, Puzzle, X } from "lucide-react"
import { Logo } from "@/components/brand/Logo"
import { BRAND_HEAD, BRAND_ICE, BRAND_TAIL } from "@/i18n/brand"
import { t } from "@/i18n/t"
import { BACK_LABELS } from "@/lib/backLink"
import { useBackLink } from "@/lib/useBackLink"
import { useExerciseAccess } from "./AccessContext"
import { BookingsMenu } from "./BookingsMenu"

/** onBookings: the phone menu opens «Бронювання» itself (after it closes); without it the dialog lives here. */
export function Sidebar({ onNavigate, onClose, onBookings }: { onNavigate?: () => void; onClose?: () => void; onBookings?: () => void }) {
  const pathname = usePathname()
  const { access } = useExerciseAccess()
  const [returnTo, setReturnTo] = useState<string | null>(null)
  useEffect(() => {
    const search = new URLSearchParams(window.location.search)
    const next = search.get("return_to") ?? search.get("return")
    queueMicrotask(() => setReturnTo(next))
  }, [pathname])
  const back = useBackLink(returnTo)
  const items = [
    { href: "/", label: "exercises.nav.catalog", icon: Puzzle, active: !pathname.startsWith("/proposals") && !pathname.startsWith("/guide") },
    { href: "/guide/", label: "exercises.nav.guide", icon: BookOpen, active: pathname.startsWith("/guide") },
    ...(access?.IsAdmin ? [{ href: "/proposals", label: "exercises.nav.proposals", icon: ClipboardList, active: pathname.startsWith("/proposals") }] : []),
  ]
  return (
    <aside className="ib-admin-side h-full w-[var(--ib-admin-side-w)] shrink-0 bg-[var(--ib-brand)] text-[var(--ib-on-brand)]" aria-label={t("exercises.app.title")}>
      <div className="ib-admin-side__head">
        <Logo size={32} className="shrink-0" />
        <div className="ib-admin-side__title">
          <b className="truncate">{BRAND_HEAD}<span className="text-[var(--ib-ice-on-brand)]">{BRAND_ICE}</span>{BRAND_TAIL}</b>
          <small>{t("exercises.app.title")}</small>
        </div>
        {onClose && <button type="button" onClick={onClose} aria-label={t("exercises.shell.closeMenu")} className="ib-hit shrink-0 rounded p-1.5 hover:bg-[var(--ib-brand-hover)] md:hidden"><X className="h-5 w-5" /></button>}
      </div>
      <nav className="ib-admin-side__nav" aria-label={t("exercises.nav.label")}>
        {items.map((item) => <Fragment key={item.href}><Link href={item.href} className="ib-admin-side__item" aria-current={item.active ? "page" : undefined} onClick={onNavigate}>
          <item.icon aria-hidden="true" /><span className="ib-admin-side__label">{t(item.label)}</span>
        </Link>{item.href === "/" && (onBookings
          ? <button type="button" className="ib-admin-side__item" aria-haspopup="dialog" onClick={onBookings}>
            <CalendarClock aria-hidden="true" /><span className="ib-admin-side__label">{t("exercises.book.menu")}</span>
          </button>
          : <BookingsMenu />)}</Fragment>)}
      </nav>
      {back && (back.kind === "admin" || back.kind === "event") && <div className="ib-admin-side__foot">
        <a href={back.href} className="ib-admin-side__item min-w-0"><ArrowLeft aria-hidden="true" /><span className="ib-admin-side__label">{t(BACK_LABELS[back.kind])}</span></a>
      </div>}
    </aside>
  )
}
