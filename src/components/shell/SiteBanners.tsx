"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"
import { apiGet } from "@/api/client"
import { t } from "@/i18n/t"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { BANNER_POLL_MS, bannerHref, bannerLevel, dismissKey, isDismissed, parseBanners, rememberDismissed, sortBanners, type SiteBanner } from "@/lib/siteBanners"
import "@/styles/site-banner.css"

// Presentational: the visible banners, most severe first.
export function SiteBannerList({ banners, onDismiss }: { banners: SiteBanner[]; onDismiss?: (banner: SiteBanner) => void }) {
  if (banners.length === 0) return null
  return (
    <div role="status" aria-label={t("siteBanner.label")}>
      {banners.map((banner) => {
        const href = bannerHref(banner.LinkURL)
        return (
          <div key={dismissKey(banner)} className={`ib-site-banner ib-site-banner--${bannerLevel(banner.Level)}`}>
            <p className="ib-site-banner__text">
              {banner.Text}
              {href ? <a className="ib-site-banner__link" href={href}>{banner.LinkLabel || t("siteBanner.more")}</a> : null}
            </p>
            {banner.Dismissible ? (
              <HoverTooltip text={t("siteBanner.dismiss")}>
                <button type="button" className="ib-site-banner__x" aria-label={t("siteBanner.dismiss")} onClick={() => onDismiss?.(banner)}>
                  <X aria-hidden="true" />
                </button>
              </HoverTooltip>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

// Site banners: public GET /api/banners (session optional), polled every minute and on tab focus.
// A banner outage never blocks the page: errors are ignored and nothing renders until data arrives.
export function SiteBanners() {
  const [banners, setBanners] = useState<SiteBanner[]>([])
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    let active = true
    const refresh = () => {
      if (document.visibilityState === "hidden") return
      apiGet<unknown>("/api/banners", undefined, { required: false })
        .then((data) => { if (active) setBanners(sortBanners(parseBanners(data))) })
        .catch(() => { /* ignored on purpose */ })
    }
    refresh()
    const timer = window.setInterval(refresh, BANNER_POLL_MS)
    document.addEventListener("visibilitychange", refresh)
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh) }
  }, [])

  const visible = banners.filter((banner) => !dismissed.has(dismissKey(banner)) && !isDismissed(banner))
  const dismiss = (banner: SiteBanner) => {
    rememberDismissed(banner)
    setDismissed((current) => new Set(current).add(dismissKey(banner)))
  }
  return <SiteBannerList banners={visible} onDismiss={dismiss} />
}
