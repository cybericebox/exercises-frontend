import * as React from "react"
import Link from "next/link"
import { t } from "@/i18n/t"

/* eslint-disable @next/next/no-img-element -- The static crest has fixed dimensions and needs no image optimization. */

// The CyberICEBox crest, the brand logo used across the apps. A static, cached file copied from
// docs/design-system/assets (crest-128.png; crest-64.png sits next to it), not a data URI in the bundle.
export const CREST_SRC = "/assets/crest-128.png"

export interface LogoProps {
  /** Rendered height in px (width scales with the 375:368 aspect). */
  size?: number
  className?: string
  /**
   * Where the brand mark links. By default it leads to NEXT_PUBLIC_MAIN_SITE_URL when that is set and to `/` of this site when it is not
   * (two anchors, one of them hidden by src/styles/cfg.css). Pass `null` to render a non-linking mark (e.g. when an ancestor already
   * wraps it in an anchor).
   */
  href?: string | null
}

export function Logo({ size = 64, className, href }: LogoProps) {
  const img = (
    <img
      src={CREST_SRC}
      alt={t("app.brand")}
      width={Math.round((size * 375) / 368)}
      height={size}
      className={className}
      style={{ display: "inline-block", width: Math.round((size * 375) / 368), height: size, flexShrink: 0, objectFit: "contain" }}
    />
  )
  if (href === null) return img
  const anchor = { "aria-label": t("app.brand"), style: { display: "inline-flex", flexShrink: 0, lineHeight: 0 } } as const
  if (href !== undefined) return <a href={href} {...anchor}>{img}</a>
  return (
    <>
      <a className="cfg-main-only" href={process.env.NEXT_PUBLIC_MAIN_SITE_URL} {...anchor}>{img}</a>
      <Link className="cfg-main-off" href="/" prefetch={false} {...anchor}>{img}</Link>
    </>
  )
}
