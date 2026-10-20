// The guide pages in reading order. Text lives in the content modules (uk only); titles go through t().
export const GUIDE_SLUGS = ["zavdannia", "variant", "pidzavdannia", "prapory", "pidkazky", "notatky", "infrastruktura", "obrazy", "arkhiv", "pomylky", "rekomendatsii"] as const
export type GuideSlug = (typeof GUIDE_SLUGS)[number]
/** "index" is the overview page at /guide/. */
export type GuidePageSlug = "index" | GuideSlug
export const GUIDE_ORDER: GuidePageSlug[] = ["index", ...GUIDE_SLUGS]

export type GuideContent = { html: string; lead: string }

export function guideHref(slug: GuidePageSlug): string {
  return slug === "index" ? "/guide/" : `/guide/${slug}/`
}

/** Loads one page's content on demand: a route bundles only its own module. */
export const GUIDE_LOADERS: Record<GuidePageSlug, () => Promise<GuideContent>> = {
  index: () => import("./index"),
  zavdannia: () => import("./zavdannia"),
  variant: () => import("./variant"),
  pidzavdannia: () => import("./pidzavdannia"),
  prapory: () => import("./prapory"),
  pidkazky: () => import("./pidkazky"),
  notatky: () => import("./notatky"),
  infrastruktura: () => import("./infrastruktura"),
  obrazy: () => import("./obrazy"),
  arkhiv: () => import("./arkhiv"),
  pomylky: () => import("./pomylky"),
  rekomendatsii: () => import("./rekomendatsii"),
}
