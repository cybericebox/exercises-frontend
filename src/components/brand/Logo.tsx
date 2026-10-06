import * as React from "react"
import { mainOrigin } from "@/lib/origins"
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
   * Where the brand mark links. Defaults to the landing (apex) origin so the
   * organisation logo navigates home from every app. Pass `null` to render a
   * non-linking mark (e.g. when an ancestor already wraps it in an anchor).
   */
  href?: string | null
}

// Shared landing origin; falls back to "/" when the public domain is unset.
const LANDING_HREF = mainOrigin

export function Logo({ size = 64, className, href }: LogoProps) {
  const img = (
    <img
      src={CREST_SRC}
      alt={t("app.brand")}
      width={Math.round((size * 375) / 368)}
      height={size}
      className={className}
      style={{ display: "inline-block", objectFit: "contain" }}
    />
  )
  const target = href === null ? null : href ?? LANDING_HREF
  if (!target) return img
  return (
    <a href={target} aria-label={t("app.brand")} style={{ display: "inline-flex", lineHeight: 0 }}>
      {img}
    </a>
  )
}
