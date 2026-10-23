"use client"

import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import * as Popover from "@radix-ui/react-popover"
import { X } from "lucide-react"
import { apiGet, apiPatch } from "@/api/client"
import { hasBanners, pulseQuery, subscribePulse } from "@/lib/pulse"
import { t } from "@/i18n/t"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { bannerHref, bannerLevel, dismissKey, isDismissed, parseBanners, rememberDismissed, type SiteBanner } from "@/lib/siteBanners"
import "@/styles/site-banner.css"
import { keepBrand } from "@/i18n/brand"

type BannerRowProps = { banner: SiteBanner; onDismiss?: (banner: SiteBanner) => void; children?: ReactNode }

function BannerRow({ banner, onDismiss, children }: BannerRowProps) {
  const href = bannerHref(banner.LinkURL)
  return (
    <div className={`ib-site-banner ib-site-banner--${bannerLevel(banner.Level)}`}>
      <p className="ib-site-banner__text">
        {keepBrand(banner.Text)}
        {href ? <a className="ib-site-banner__link" href={href}>{keepBrand(banner.LinkLabel || t("siteBanner.more"))}</a> : null}
      </p>
      {children}
      {banner.Dismissible ? (<HoverTooltip text={t("siteBanner.dismiss")}><button type="button" className="ib-site-banner__x" aria-label={t("siteBanner.dismiss")} onClick={() => onDismiss?.(banner)}>
          <X aria-hidden="true" />
        </button></HoverTooltip>) : null}
    </div>
  )
}

// The API order is authoritative. Only the first announcement occupies the page header.
export function SiteBannerList({ banners, onDismiss }: { banners: SiteBanner[]; onDismiss?: (banner: SiteBanner) => void }) {
  const titleId = useId()
  const titleRef = useRef<HTMLHeadingElement>(null)
  if (banners.length === 0) return null
  const [primary, ...others] = banners
  const plural = new Intl.PluralRules("uk").select(others.length)
  return (
    <div role="status" aria-label={t("siteBanner.label")} className="ib-site-banners">
      <Popover.Root modal={false}>
        <BannerRow banner={primary} onDismiss={onDismiss}>
          {others.length > 0 ? (
            <Popover.Trigger asChild>
              <button type="button" className="ib-site-banner__more">{t(`siteBanner.moreAnnouncements.${plural}`, { count: others.length })}</button>
            </Popover.Trigger>
          ) : null}
        </BannerRow>
        {others.length > 0 ? (
          <Popover.Portal>
            <Popover.Content className="ib-site-banner-panel" side="bottom" align="end" sideOffset={8} collisionPadding={16} aria-labelledby={titleId} onOpenAutoFocus={(event) => { event.preventDefault(); titleRef.current?.focus() }}>
              <h2 ref={titleRef} id={titleId} tabIndex={-1} className="ib-site-banner-panel__title">{t("siteBanner.others")}</h2>
              {others.map((banner) => <BannerRow key={dismissKey(banner)} banner={banner} onDismiss={onDismiss} />)}
            </Popover.Content>
          </Popover.Portal>
        ) : null}
      </Popover.Root>
    </div>
  )
}

// The list last fetched in this tab and the pulse version it stands for: a remount (another layout) reuses it.
let held: { version: string; banners: SiteBanner[] } | null = null

/** Test helper: forget the held list, as on a fresh page load. */
export function forgetHeldBanners(): void { held = null }

// Site banners: the list is fetched on load and again only when the pulse's Banners version changes; never for
// a version of an empty list. A banner outage never blocks the page: errors are ignored and nothing renders until data arrives.
export function SiteBanners() {
  const [banners, setBanners] = useState<SiteBanner[]>(() => held?.banners ?? [])
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    let active = true
    let fetching = false
    let wanted: string | null = null
    const load = (next: string) => {
      wanted = next
      if (fetching || next === held?.version) return
      // No banners at all: nothing to ask, the list is simply empty.
      if (!hasBanners(next)) { held = { version: next, banners: [] }; setBanners([]); return }
      fetching = true
      const requested = next
      apiGet<unknown>(`/api/notifications/banners${pulseQuery()}`, undefined, { required: false })
        .then((data) => { const list = parseBanners(data); held = { version: requested, banners: list }; if (active) setBanners(list) })
        .catch(() => { /* ignored on purpose; the version stays unknown, so the next pulse retries */ })
        .finally(() => {
          fetching = false
          if (active && wanted !== null && wanted !== requested) load(wanted)
        })
    }
    const unsubscribe = subscribePulse((pulse) => { if (pulse.Banners !== held?.version) load(pulse.Banners) })
    return () => { active = false; unsubscribe() }
  }, [])

  const visible = banners.filter((banner) => !dismissed.has(dismissKey(banner)) && !isDismissed(banner))
  const dismiss = (banner: SiteBanner) => {
    rememberDismissed(banner)
    if (banner.Kind === "personal") apiPatch(`/api/notifications/banners/${encodeURIComponent(banner.ID)}/dismiss`, {}, undefined, { required: false }).catch(() => { /* hidden here; the server keeps it until the next successful dismiss */ })
    setDismissed((current) => new Set(current).add(dismissKey(banner)))
  }
  return <SiteBannerList banners={visible} onDismiss={dismiss} />
}
