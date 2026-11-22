// The guide pages in reading order. Text lives in the content modules (uk only); titles go through t().
export const GUIDE_SLUGS = ["zavdannia", "variant", "pidzavdannia", "prapory", "stan", "pidkazky", "notatky", "infrastruktura", "prystroi", "obrazy", "testuvannia", "publikatsiia", "arkhiv", "pomylky", "rekomendatsii"] as const
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
  stan: () => import("./stan"),
  pidkazky: () => import("./pidkazky"),
  notatky: () => import("./notatky"),
  infrastruktura: () => import("./infrastruktura"),
  prystroi: () => import("./prystroi"),
  obrazy: () => import("./obrazy"),
  testuvannia: () => import("./testuvannia"),
  publikatsiia: () => import("./publikatsiia"),
  arkhiv: () => import("./arkhiv"),
  pomylky: () => import("./pomylky"),
  rekomendatsii: () => import("./rekomendatsii"),
}
