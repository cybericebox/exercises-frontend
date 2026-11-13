import * as React from "react"
import Link from "next/link"
import { Logo } from "./Logo"
import { BRAND_HEAD, BRAND_TAIL } from "@/i18n/brand"
import { t } from "@/i18n/t"

// Brand lockup — the old crest logo plus the Cyber ICE Box wordmark. Links to NEXT_PUBLIC_MAIN_SITE_URL when that is set and to `/` of this
// site when it is not (two anchors, one hidden by src/styles/cfg.css); pass href={null} to render a non-linking lockup.
export function Wordmark({
  className,
  withMark = true,
  size = "md",
  href,
}: {
  className?: string
  withMark?: boolean
  size?: "sm" | "md" | "lg"
  /** Link target; by default the main site if one is set, else `/`. Pass `null` for no link. */
  href?: string | null
}) {
  const text =
    size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-lg"
  const mark = size === "lg" ? 40 : size === "sm" ? 24 : 30
  const lockup = (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${text} ${className ?? ""}`}>
      {withMark && <Logo size={mark} href={null} />}
      <span className="whitespace-nowrap text-foreground">
        {BRAND_HEAD}<span className="text-[var(--ib-ice)]">ICE</span>{BRAND_TAIL}
      </span>
    </span>
  )
  if (href === null) return lockup
  if (href !== undefined) return <a href={href} aria-label={t("app.brand")} className="inline-flex no-underline">{lockup}</a>
  return (
    <>
      <a className="cfg-main-only inline-flex no-underline" href={process.env.NEXT_PUBLIC_MAIN_SITE_URL} aria-label={t("app.brand")}>{lockup}</a>
      <Link className="cfg-main-off inline-flex no-underline" href="/" prefetch={false} aria-label={t("app.brand")}>{lockup}</Link>
    </>
  )
}
